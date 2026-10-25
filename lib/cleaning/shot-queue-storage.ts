// IndexedDB-backed durability for the walkthrough photo queue. Ported from the
// Quote Tool's crew-camera photoQueueStorage.ts.
//
// A shot is written here the moment the shutter fires, before any upload is
// attempted, and removed only once the server has confirmed it. That ordering
// is what lets a photo survive a closed tab: if the app is swiped away, the
// browser kills the tab to reclaim memory, or the page just reloads, whatever
// is still in here on reopening is not lost. Uploading first and saving
// second loses exactly the shots taken on a bad connection, which is when
// the queue matters most.
//
// Every call is capped by a timeout and wrapped so a stuck or broken backend
// can never make the caller hang or throw. A phone in private mode, one that
// refuses the quota, or a browser with no IndexedDB must still let the leader
// shoot and upload normally. The cost is that durability is best effort, so
// each call answers true or false: false means "not saved", and the caller
// keeps the blob in memory and carries on.
//
// The IndexedDB access sits behind ShotStoreBackend so the guard logic is
// testable with a plain in-memory fake, no browser needed.

export type StoredShot = {
  /** Client-generated photo id. The server dedupes on it, so resending is safe. */
  id: string;
  blob: Blob;
  /** The details form, once filled in. null between the shutter and the form. */
  payload: unknown | null;
  /** ISO timestamp of the shutter press, kept so a late upload still reports when it was taken. */
  capturedAt: string;
  /** Epoch ms the record was first written. Orders the queue, oldest first. */
  createdAt: number;
};

export interface ShotStoreBackend {
  put(shot: StoredShot): Promise<boolean>;
  /** false when no record with that id exists (nothing to patch) or the write failed. */
  setPayload(id: string, payload: unknown): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  getAll(): Promise<StoredShot[]>;
}

const DB_NAME = "fiq-cleaning";
const DB_VERSION = 1;
const STORE_NAME = "shots";

class IndexedDbShotStore implements ShotStoreBackend {
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private open(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    const promise = new Promise<IDBDatabase | null>((resolve) => {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "id" });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          // Phone browsers close an idle connection when the app is
          // backgrounded. Forget it so the next call opens a fresh one
          // instead of failing on a dead handle for the rest of the shift.
          db.onclose = () => {
            this.dbPromise = null;
          };
          db.onversionchange = () => {
            db.close();
            this.dbPromise = null;
          };
          resolve(db);
        };
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    this.dbPromise = promise;
    // Never remember a failed open: private mode and a blocked upgrade can
    // clear up, and a cached null would disable the queue until a reload.
    void promise.then((db) => {
      if (!db && this.dbPromise === promise) this.dbPromise = null;
    });
    return promise;
  }

  // One transaction, resolved on tx.oncomplete and never on the request
  // callback. A request can succeed and the commit can still abort (quota),
  // and only the commit means the bytes are on disk.
  private async run<T>(
    mode: IDBTransactionMode,
    fallback: T,
    body: (store: IDBObjectStore, setResult: (value: T) => void) => void,
  ): Promise<T> {
    const db = await this.open();
    if (!db) return fallback;
    return new Promise<T>((resolve) => {
      try {
        let result = fallback;
        const tx = db.transaction(STORE_NAME, mode);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => resolve(fallback);
        tx.onabort = () => resolve(fallback);
        body(tx.objectStore(STORE_NAME), (value) => {
          result = value;
        });
      } catch (err) {
        // InvalidStateError means the connection died under us: reopen next
        // call. Anything else (a blob the browser refuses to clone) leaves
        // the connection fine.
        if (err instanceof DOMException && err.name === "InvalidStateError") {
          this.dbPromise = null;
        }
        resolve(fallback);
      }
    });
  }

  put(shot: StoredShot): Promise<boolean> {
    return this.run("readwrite", false, (store, setResult) => {
      store.put(shot);
      setResult(true);
    });
  }

  // Read and write inside ONE readwrite transaction so a payload update can
  // never interleave with a delete and resurrect a shot that just uploaded.
  setPayload(id: string, payload: unknown): Promise<boolean> {
    return this.run("readwrite", false, (store, setResult) => {
      const req = store.get(id);
      req.onsuccess = () => {
        const existing = req.result as StoredShot | undefined;
        if (!existing) return;
        // An exception escaping a request handler aborts the transaction and
        // surfaces as an uncaught error. Swallow it: the answer is just false.
        try {
          store.put({ ...existing, payload });
          setResult(true);
        } catch {
          // result stays false
        }
      };
    });
  }

  delete(id: string): Promise<boolean> {
    return this.run("readwrite", false, (store, setResult) => {
      store.delete(id);
      setResult(true);
    });
  }

  getAll(): Promise<StoredShot[]> {
    return this.run<StoredShot[]>("readonly", [], (store, setResult) => {
      const req = store.getAll();
      req.onsuccess = () => setResult((req.result as StoredShot[] | undefined) ?? []);
    });
  }
}

let backend: ShotStoreBackend | null = null;
function getBackend(): ShotStoreBackend {
  if (!backend) backend = new IndexedDbShotStore();
  return backend;
}

/** Test-only seam: inject a fake backend instead of touching indexedDB.
 * Pass null to drop it and start over with a fresh real one. */
export function setShotStoreBackendForTest(fake: ShotStoreBackend | null): void {
  backend = fake;
}

// Storage must never block or break the shutter. Every call below is capped
// so a stuck request (a wedged IndexedDB transaction, a hostile backend)
// resolves to a safe default instead of hanging the caller.
const BACKEND_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), BACKEND_TIMEOUT_MS);
    promise.then(finish, () => finish(fallback));
  });
}

/** Runs one backend call, guarded against a synchronous throw, an async
 * rejection and a hang, degrading to `fallback` in every case. This is the one
 * place the "never blocks, never breaks" promise lives, so it holds no matter
 * which backend (real or a test fake) is installed. */
function callBackend<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return withTimeout(fn(), fallback);
  } catch {
    return Promise.resolve(fallback);
  }
}

/** Upsert one shot's full record. Called at the shutter, before any upload. */
export function writeShot(shot: StoredShot): Promise<boolean> {
  return callBackend(() => getBackend().put(shot), false);
}

/** Attach the filled-in details to a shot already written. false if the shot
 * is not in storage (the first write failed, or it already uploaded). */
export function updateShotPayload(id: string, payload: unknown): Promise<boolean> {
  return callBackend(() => getBackend().setPayload(id, payload), false);
}

/** Remove a shot once the server has confirmed it. Deleting an id that is
 * already gone still answers true. */
export function deleteShot(id: string): Promise<boolean> {
  return callBackend(() => getBackend().delete(id), false);
}

/** Everything left over from earlier in the shift or a previous session,
 * oldest first so the queue drains in the order the photos were taken. */
export async function loadShots(): Promise<StoredShot[]> {
  const shots = await callBackend(() => getBackend().getAll(), [] as StoredShot[]);
  return [...shots].sort((a, b) => a.createdAt - b.createdAt);
}
