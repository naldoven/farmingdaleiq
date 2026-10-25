// The phone queue's storage. jsdom has no IndexedDB, and adding a fake-indexeddb
// dependency is off the table, so there are three layers here:
//   1. no indexedDB at all (the real adapter, as jsdom runs it);
//   2. the guard logic (timeouts, throws, ordering) over a plain in-memory backend;
//   3. the real IndexedDB adapter over a tiny hand-made indexedDB, which is
//      enough to prove transaction use: commit-time resolve, one-transaction
//      payload update, reopening after a closed connection.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteShot,
  loadShots,
  setShotStoreBackendForTest,
  updateShotPayload,
  writeShot,
  type ShotStoreBackend,
  type StoredShot,
} from "./shot-queue-storage";

function makeShot(over: Partial<StoredShot> = {}): StoredShot {
  return {
    id: "shot-1",
    blob: new Blob(["jpeg-bytes"], { type: "image/jpeg" }),
    payload: null,
    capturedAt: "2026-10-25T14:00:00.000Z",
    createdAt: 1000,
    ...over,
  };
}

beforeEach(() => {
  setShotStoreBackendForTest(null);
});

afterEach(() => {
  setShotStoreBackendForTest(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("no IndexedDB available (private mode, old browser, jsdom)", () => {
  it("really has no indexedDB in this environment", () => {
    expect(typeof indexedDB).toBe("undefined");
  });

  it("writeShot answers false without throwing", async () => {
    await expect(writeShot(makeShot())).resolves.toBe(false);
  });

  it("updateShotPayload answers false without throwing", async () => {
    await expect(updateShotPayload("shot-1", { area: "kitchen" })).resolves.toBe(false);
  });

  it("deleteShot answers false without throwing", async () => {
    await expect(deleteShot("shot-1")).resolves.toBe(false);
  });

  it("loadShots answers an empty list without throwing", async () => {
    await expect(loadShots()).resolves.toEqual([]);
  });
});

// A plain Map-backed fake of the backend seam.
class MemoryBackend implements ShotStoreBackend {
  store = new Map<string, StoredShot>();

  async put(shot: StoredShot): Promise<boolean> {
    this.store.set(shot.id, shot);
    return true;
  }
  async setPayload(id: string, payload: unknown): Promise<boolean> {
    const existing = this.store.get(id);
    if (!existing) return false;
    this.store.set(id, { ...existing, payload });
    return true;
  }
  async delete(id: string): Promise<boolean> {
    this.store.delete(id);
    return true;
  }
  async getAll(): Promise<StoredShot[]> {
    return [...this.store.values()];
  }
}

/** Every call rejects: a full quota, or a browser that hands out a broken store. */
class RejectingBackend implements ShotStoreBackend {
  async put(): Promise<boolean> {
    throw new Error("QuotaExceededError");
  }
  async setPayload(): Promise<boolean> {
    throw new Error("QuotaExceededError");
  }
  async delete(): Promise<boolean> {
    throw new Error("storage unavailable");
  }
  async getAll(): Promise<StoredShot[]> {
    throw new Error("storage unavailable");
  }
}

/** Every call throws before it returns a promise at all. */
class ThrowingBackend implements ShotStoreBackend {
  put(): Promise<boolean> {
    throw new Error("sync boom");
  }
  setPayload(): Promise<boolean> {
    throw new Error("sync boom");
  }
  delete(): Promise<boolean> {
    throw new Error("sync boom");
  }
  getAll(): Promise<StoredShot[]> {
    throw new Error("sync boom");
  }
}

/** Never answers: a wedged IndexedDB transaction. */
class HangingBackend implements ShotStoreBackend {
  put(): Promise<boolean> {
    return new Promise(() => {});
  }
  setPayload(): Promise<boolean> {
    return new Promise(() => {});
  }
  delete(): Promise<boolean> {
    return new Promise(() => {});
  }
  getAll(): Promise<StoredShot[]> {
    return new Promise(() => {});
  }
}

describe("the queue API over a working backend", () => {
  let memory: MemoryBackend;
  beforeEach(() => {
    memory = new MemoryBackend();
    setShotStoreBackendForTest(memory);
  });

  it("a shot written at the shutter comes back, blob and all", async () => {
    const shot = makeShot();
    await expect(writeShot(shot)).resolves.toBe(true);
    const [back] = await loadShots();
    expect(back).toEqual(shot);
    expect(back.blob).toBe(shot.blob);
  });

  it("writing the same id again replaces the record instead of doubling it", async () => {
    await writeShot(makeShot({ capturedAt: "2026-10-25T14:00:00.000Z" }));
    await writeShot(makeShot({ capturedAt: "2026-10-25T14:05:00.000Z" }));
    const shots = await loadShots();
    expect(shots).toHaveLength(1);
    expect(shots[0].capturedAt).toBe("2026-10-25T14:05:00.000Z");
  });

  it("loadShots returns the oldest shot first, whatever order they were written in", async () => {
    await writeShot(makeShot({ id: "c", createdAt: 3000 }));
    await writeShot(makeShot({ id: "a", createdAt: 1000 }));
    await writeShot(makeShot({ id: "b", createdAt: 2000 }));
    expect((await loadShots()).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("loadShots does not reorder the backend's own array", async () => {
    const backendOrder = [makeShot({ id: "b", createdAt: 2 }), makeShot({ id: "a", createdAt: 1 })];
    setShotStoreBackendForTest(Object.assign(new MemoryBackend(), { getAll: async () => backendOrder }));
    await loadShots();
    expect(backendOrder.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("an empty queue loads as an empty list", async () => {
    await expect(loadShots()).resolves.toEqual([]);
  });

  it("updateShotPayload attaches the details and leaves everything else alone", async () => {
    const shot = makeShot();
    await writeShot(shot);
    await expect(updateShotPayload("shot-1", { area: "Walk-in cooler", note: "Fan guard greasy" })).resolves.toBe(true);
    const [back] = await loadShots();
    expect(back.payload).toEqual({ area: "Walk-in cooler", note: "Fan guard greasy" });
    expect(back.blob).toBe(shot.blob);
    expect(back.capturedAt).toBe(shot.capturedAt);
    expect(back.createdAt).toBe(shot.createdAt);
  });

  it("updateShotPayload answers false for a shot that is not stored", async () => {
    await expect(updateShotPayload("ghost", { area: "x" })).resolves.toBe(false);
    await expect(loadShots()).resolves.toEqual([]);
  });

  it("deleteShot removes the shot", async () => {
    await writeShot(makeShot());
    await expect(deleteShot("shot-1")).resolves.toBe(true);
    await expect(loadShots()).resolves.toEqual([]);
  });

  it("deleting a shot that is already gone is still a quiet success", async () => {
    await expect(deleteShot("ghost")).resolves.toBe(true);
  });
});

describe("a broken backend degrades instead of breaking the shutter", () => {
  for (const [name, make] of [
    ["rejects", () => new RejectingBackend()],
    ["throws synchronously", () => new ThrowingBackend()],
  ] as const) {
    describe(`backend that ${name}`, () => {
      beforeEach(() => {
        setShotStoreBackendForTest(make());
      });

      it("writeShot answers false", async () => {
        await expect(writeShot(makeShot())).resolves.toBe(false);
      });
      it("updateShotPayload answers false", async () => {
        await expect(updateShotPayload("shot-1", {})).resolves.toBe(false);
      });
      it("deleteShot answers false", async () => {
        await expect(deleteShot("shot-1")).resolves.toBe(false);
      });
      it("loadShots answers an empty list", async () => {
        await expect(loadShots()).resolves.toEqual([]);
      });
    });
  }

  describe("backend that never answers", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      setShotStoreBackendForTest(new HangingBackend());
    });

    it("gives up after 2 seconds, not before", async () => {
      let settled = false;
      void writeShot(makeShot()).then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(1999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
    });

    it("every call degrades to its safe answer", async () => {
      const results = Promise.all([
        writeShot(makeShot()),
        updateShotPayload("shot-1", {}),
        deleteShot("shot-1"),
        loadShots(),
      ]);
      await vi.advanceTimersByTimeAsync(2000);
      await expect(results).resolves.toEqual([false, false, false, []]);
    });
  });

  it("a slow answer that lands after the timeout does not flip the result", async () => {
    vi.useFakeTimers();
    let release: (value: boolean) => void = () => {};
    setShotStoreBackendForTest(
      Object.assign(new MemoryBackend(), {
        put: () => new Promise<boolean>((resolve) => (release = resolve)),
      }),
    );
    const result = writeShot(makeShot());
    await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toBe(false);
    release(true);
    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The real adapter over a minimal hand-made indexedDB.

type FakeRequest<T> = { result: T; onsuccess: (() => void) | null };

type FakeTx = {
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  objectStore: () => unknown;
};

type FakeDb = {
  onclose: (() => void) | null;
  onversionchange: (() => void) | null;
  objectStoreNames: { contains: (name: string) => boolean };
  createObjectStore: (name: string, options: { keyPath: string }) => unknown;
  close: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
};

/** Requests answer on a later tick, and a transaction commits only when every
 * request (including ones queued from inside a success handler) has been
 * answered. Writes are staged and reach `records` only on commit, which lets a
 * test model a quota failure at commit time. */
function createFakeIndexedDb(options: { failOpens?: number; abortCommit?: boolean } = {}) {
  const records = new Map<string, StoredShot>();
  const stores = new Set<string>();
  const modes: string[] = [];
  let failOpens = options.failOpens ?? 0;

  const db: FakeDb = {
    onclose: null,
    onversionchange: null,
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore: (name) => {
      stores.add(name);
      return {};
    },
    close: vi.fn(),
    transaction: vi.fn((_storeName: string, mode: string): FakeTx => {
      modes.push(mode);
      const staged: Array<() => void> = [];
      let pending = 0;
      const tx: FakeTx = { oncomplete: null, onerror: null, onabort: null, objectStore: () => store };
      const settle = () => {
        if (pending > 0) return;
        if (options.abortCommit && staged.length > 0) {
          tx.onabort?.();
          return;
        }
        staged.forEach((apply) => apply());
        tx.oncomplete?.();
      };
      const request = <T>(result: T, apply?: () => void): FakeRequest<T> => {
        const req: FakeRequest<T> = { result, onsuccess: null };
        pending++;
        if (apply) staged.push(apply);
        setTimeout(() => {
          req.onsuccess?.();
          pending--;
          settle();
        }, 0);
        return req;
      };
      const store = {
        put: (value: StoredShot) => request(value.id, () => records.set(value.id, value)),
        get: (id: string) => request(records.get(id)),
        delete: (id: string) => request(undefined, () => records.delete(id)),
        getAll: () => request([...records.values()]),
      };
      return tx;
    }),
  };

  const open = vi.fn(() => {
    const req = {
      result: db,
      onupgradeneeded: null as (() => void) | null,
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onblocked: null as (() => void) | null,
    };
    setTimeout(() => {
      if (failOpens > 0) {
        failOpens--;
        req.onerror?.();
        return;
      }
      req.onupgradeneeded?.();
      req.onsuccess?.();
    }, 0);
    return req;
  });

  return { indexedDB: { open }, open, db, records, stores, modes };
}

describe("the real IndexedDB adapter", () => {
  it("opens database fiq-cleaning and creates the shots store", async () => {
    const fake = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.indexedDB);

    await writeShot(makeShot());

    expect(fake.open).toHaveBeenCalledWith("fiq-cleaning", 1);
    expect(fake.stores.has("shots")).toBe(true);
  });

  it("opens the database once, not once per call", async () => {
    const fake = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.indexedDB);

    await writeShot(makeShot({ id: "a" }));
    await writeShot(makeShot({ id: "b" }));
    await loadShots();

    expect(fake.open).toHaveBeenCalledTimes(1);
  });

  it("answers true only once the write has committed", async () => {
    const fake = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.indexedDB);
    const shot = makeShot();

    await expect(writeShot(shot)).resolves.toBe(true);

    expect(fake.records.get("shot-1")).toBe(shot);
  });

  it("answers false when the commit aborts (quota), and nothing is stored", async () => {
    const fake = createFakeIndexedDb({ abortCommit: true });
    vi.stubGlobal("indexedDB", fake.indexedDB);

    await expect(writeShot(makeShot())).resolves.toBe(false);

    expect(fake.records.size).toBe(0);
  });

  it("round-trips shots oldest first", async () => {
    const fake = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.indexedDB);
    await writeShot(makeShot({ id: "late", createdAt: 2000 }));
    await writeShot(makeShot({ id: "early", createdAt: 1000 }));

    expect((await loadShots()).map((s) => s.id)).toEqual(["early", "late"]);
  });

  it("reads in a readonly transaction and writes in readwrite ones", async () => {
    const fake = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.indexedDB);

    await writeShot(makeShot());
    await loadShots();
    await deleteShot("shot-1");

    expect(fake.modes).toEqual(["readwrite", "readonly", "readwrite"]);
  });

  it("updateShotPayload patches the stored record in one readwrite transaction", async () => {
    const fake = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.indexedDB);
    const shot = makeShot();
    await writeShot(shot);
    fake.modes.length = 0;

    await expect(updateShotPayload("shot-1", { area: "Dish pit" })).resolves.toBe(true);

    expect(fake.modes).toEqual(["readwrite"]);
    expect(fake.records.get("shot-1")).toEqual({ ...shot, payload: { area: "Dish pit" } });
    expect(fake.records.get("shot-1")?.blob).toBe(shot.blob);
  });

  it("updateShotPayload answers false and writes nothing for an id that is not there", async () => {
    const fake = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.indexedDB);

    await expect(updateShotPayload("ghost", { area: "x" })).resolves.toBe(false);

    expect(fake.records.size).toBe(0);
  });

  it("deleteShot removes the record", async () => {
    const fake = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.indexedDB);
    await writeShot(makeShot());

    await expect(deleteShot("shot-1")).resolves.toBe(true);

    expect(fake.records.size).toBe(0);
  });

  it("a failed open degrades to false, and the next call tries again", async () => {
    const fake = createFakeIndexedDb({ failOpens: 1 });
    vi.stubGlobal("indexedDB", fake.indexedDB);

    await expect(writeShot(makeShot())).resolves.toBe(false);
    await expect(writeShot(makeShot())).resolves.toBe(true);

    expect(fake.open).toHaveBeenCalledTimes(2);
    expect(fake.records.size).toBe(1);
  });

  it("a connection the browser closed (phone backgrounded) is reopened on the next call", async () => {
    const fake = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.indexedDB);
    await writeShot(makeShot({ id: "a" }));

    fake.db.onclose?.();
    await expect(writeShot(makeShot({ id: "b" }))).resolves.toBe(true);

    expect(fake.open).toHaveBeenCalledTimes(2);
  });

  it("a version change from another tab closes this connection and reopens next call", async () => {
    const fake = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.indexedDB);
    await writeShot(makeShot({ id: "a" }));

    fake.db.onversionchange?.();
    expect(fake.db.close).toHaveBeenCalledTimes(1);
    await writeShot(makeShot({ id: "b" }));

    expect(fake.open).toHaveBeenCalledTimes(2);
  });

  it("a transaction on a dead connection answers false, then the next call reopens and works", async () => {
    const fake = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.indexedDB);
    await writeShot(makeShot({ id: "a" }));
    fake.db.transaction.mockImplementationOnce(() => {
      throw new DOMException("The database connection is closing.", "InvalidStateError");
    });

    await expect(writeShot(makeShot({ id: "b" }))).resolves.toBe(false);
    await expect(writeShot(makeShot({ id: "c" }))).resolves.toBe(true);

    expect(fake.open).toHaveBeenCalledTimes(2);
    expect([...fake.records.keys()].sort()).toEqual(["a", "c"]);
  });

  it("another kind of transaction error does not throw the connection away", async () => {
    const fake = createFakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.indexedDB);
    await writeShot(makeShot({ id: "a" }));
    fake.db.transaction.mockImplementationOnce(() => {
      throw new DOMException("Could not clone", "DataCloneError");
    });

    await expect(writeShot(makeShot({ id: "b" }))).resolves.toBe(false);
    await expect(writeShot(makeShot({ id: "c" }))).resolves.toBe(true);

    expect(fake.open).toHaveBeenCalledTimes(1);
  });

  it("indexedDB.open throwing is a quiet false", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("SecurityError");
      },
    });

    await expect(writeShot(makeShot())).resolves.toBe(false);
    await expect(loadShots()).resolves.toEqual([]);
  });
});
