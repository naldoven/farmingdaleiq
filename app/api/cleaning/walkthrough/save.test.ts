import { describe, expect, it } from "vitest";

import { walkthroughSaveSchema } from "@/app/(app)/cleaning/validation";
import { saveWalkthroughPhoto, type SaveDeps } from "./save";

const PHOTO = "22222222-2222-4222-8222-222222222222";
const ZONE = "11111111-1111-4111-8111-111111111111";
const ITEM = "33333333-3333-4333-8333-333333333333";
const JPEG = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), contentType: "image/jpeg" };

const newItemSave = walkthroughSaveSchema.parse({
  photoId: PHOTO,
  capturedAt: "2026-10-26T22:00:00.000Z",
  captureSource: "live",
  markup: { strokes: [{ points: [[0.2, 0.2], [0.4, 0.4]] }] },
  target: {
    mode: "new",
    details: { zoneId: ZONE, name: "Vent above boards", kind: "variable", half: "either", intervalWeeks: 4 },
  },
});

const existingSave = walkthroughSaveSchema.parse({
  photoId: PHOTO,
  captureSource: "live",
  target: { mode: "existing", itemId: ITEM },
});

/** A fake store that remembers what landed, like the real tables would. */
function fakeStore(overrides: Partial<SaveDeps> = {}) {
  const photos = new Map<string, { item_id: string }>();
  const items = new Map<string, { status: string }>();
  const objects = new Set<string>();
  const calls = { upload: 0, insertItem: 0, insertPhoto: 0 };
  const deps: SaveDeps = {
    async findPhoto(id) {
      const row = photos.get(id);
      return row ? { itemId: row.item_id } : null;
    },
    async findItem(id) {
      return items.get(id) ?? null;
    },
    async upload(path) {
      calls.upload += 1;
      if (objects.has(path)) return { error: { statusCode: "409", message: "The resource already exists" } };
      objects.add(path);
      return { error: null };
    },
    async insertItem(row) {
      calls.insertItem += 1;
      if (items.has(row.id!)) return { error: { code: "23505", message: "duplicate key" } };
      items.set(row.id!, { status: row.status ?? "draft" });
      return { error: null };
    },
    async insertPhoto(row) {
      calls.insertPhoto += 1;
      if (photos.has(row.id)) return { error: { code: "23505", message: "duplicate key" } };
      photos.set(row.id, { item_id: row.item_id });
      return { error: null };
    },
    ...overrides,
  };
  return { deps, photos, items, objects, calls };
}

describe("saveWalkthroughPhoto", () => {
  it("creates a draft item keyed by the photo id, then the photo", async () => {
    const store = fakeStore();
    const result = await saveWalkthroughPhoto(store.deps, newItemSave, JPEG);
    expect(result).toEqual({ status: 201, body: { ok: true, itemId: PHOTO, duplicate: false } });
    expect(store.items.get(PHOTO)).toEqual({ status: "draft" });
    expect(store.objects.has(`items/${PHOTO}.jpg`)).toBe(true);
  });

  it("sending the same shot twice saves it once", async () => {
    const store = fakeStore();
    await saveWalkthroughPhoto(store.deps, newItemSave, JPEG);
    const again = await saveWalkthroughPhoto(store.deps, newItemSave, JPEG);
    expect(again).toEqual({ status: 200, body: { ok: true, itemId: PHOTO, duplicate: true } });
    expect(store.items.size).toBe(1);
    expect(store.photos.size).toBe(1);
    expect(store.calls.upload).toBe(1);
  });

  it("finishes a try that died after the upload", async () => {
    const store = fakeStore();
    store.objects.add(`items/${PHOTO}.jpg`);
    const result = await saveWalkthroughPhoto(store.deps, newItemSave, JPEG);
    expect(result.status).toBe(201);
    expect(store.photos.size).toBe(1);
  });

  it("finishes a try that died after the item insert", async () => {
    const store = fakeStore();
    store.objects.add(`items/${PHOTO}.jpg`);
    store.items.set(PHOTO, { status: "draft" });
    const result = await saveWalkthroughPhoto(store.deps, newItemSave, JPEG);
    expect(result).toEqual({ status: 201, body: { ok: true, itemId: PHOTO, duplicate: false } });
    expect(store.items.size).toBe(1);
  });

  it("treats losing a race on the photo row as already saved", async () => {
    const store = fakeStore({
      async insertPhoto() {
        return { error: { code: "23505", message: "duplicate key" } };
      },
    });
    const result = await saveWalkthroughPhoto(store.deps, newItemSave, JPEG);
    expect(result.body).toEqual({ ok: true, itemId: PHOTO, duplicate: true });
  });

  it("attaches a photo to an existing item without creating one", async () => {
    const store = fakeStore();
    store.items.set(ITEM, { status: "active" });
    const result = await saveWalkthroughPhoto(store.deps, existingSave, JPEG);
    expect(result).toEqual({ status: 201, body: { ok: true, itemId: ITEM, duplicate: false } });
    expect(store.calls.insertItem).toBe(0);
    expect(store.photos.get(PHOTO)).toEqual({ item_id: ITEM });
  });

  it("refuses to attach to a retired or missing item, and stores nothing", async () => {
    const store = fakeStore();
    store.items.set(ITEM, { status: "retired" });
    const retired = await saveWalkthroughPhoto(store.deps, existingSave, JPEG);
    expect(retired.status).toBe(404);
    store.items.clear();
    const missing = await saveWalkthroughPhoto(store.deps, existingSave, JPEG);
    expect(missing.status).toBe(404);
    expect(store.calls.upload).toBe(0);
  });

  it("asks the phone to retry when storage fails", async () => {
    const store = fakeStore({
      async upload() {
        return { error: { statusCode: "500", message: "Internal" } };
      },
    });
    const result = await saveWalkthroughPhoto(store.deps, newItemSave, JPEG);
    expect(result.status).toBe(500);
    expect(store.calls.insertItem).toBe(0);
  });

  it("holds (4xx) when the database refuses the item for good", async () => {
    const store = fakeStore({
      async insertItem() {
        return { error: { code: "42501", message: "new row violates row-level security policy" } };
      },
    });
    const result = await saveWalkthroughPhoto(store.deps, newItemSave, JPEG);
    expect(result.status).toBe(400);
    expect(store.calls.insertPhoto).toBe(0);
  });

  it("retries (5xx) on a transient item insert failure", async () => {
    const store = fakeStore({
      async insertItem() {
        return { error: { code: "08006", message: "connection failure" } };
      },
    });
    expect((await saveWalkthroughPhoto(store.deps, newItemSave, JPEG)).status).toBe(500);
  });

  it("refuses an image type the bucket does not take", async () => {
    const store = fakeStore();
    const result = await saveWalkthroughPhoto(store.deps, newItemSave, { bytes: JPEG.bytes, contentType: "image/heic" });
    expect(result.status).toBe(400);
    expect(store.calls.upload).toBe(0);
  });
});
