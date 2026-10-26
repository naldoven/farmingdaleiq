// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { PHOTO_MAX_BYTES } from "@/app/(app)/cleaning/constants";
import { FIND_URL_TTL_SECONDS, findPhotoPath, parseFindRequest, postFind, type FindDeps } from "./finds";

const ZONE = "11111111-1111-4111-8111-111111111111";
const PHOTO = "22222222-2222-4222-8222-222222222222";
const OTHER_PHOTO = "33333333-3333-4333-8333-333333333333";
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const JPEG = { bytes: JPEG_BYTES, contentType: "image/jpeg" };
const INPUT = { photoId: PHOTO, zoneId: ZONE, note: "Grease behind the fryer" };
const SIGNED = "https://example.supabase.co/storage/v1/object/sign/cleaning-photos/finds/x.jpg?token=abc";

afterEach(() => {
  vi.restoreAllMocks();
});

type Row = Parameters<FindDeps["insert"]>[0];

/**
 * A fake that behaves like the bucket and the table: it remembers uploads,
 * keeps one row per id, and records what was announced.
 */
function fakeStore(overrides: Partial<FindDeps> = {}, opts: { zone?: { name: string; active: boolean } | null } = {}) {
  const objects = new Set<string>();
  const rows = new Map<string, Row>();
  const calls = { upload: 0, insert: 0, sign: 0 };
  const emitted: Record<string, unknown>[] = [];
  const ttls: number[] = [];
  const zone = opts.zone === undefined ? { name: "Fryer line", active: true } : opts.zone;
  const deps: FindDeps = {
    async zone() {
      return { zone, error: null };
    },
    async upload(path) {
      calls.upload += 1;
      if (objects.has(path)) return { error: { statusCode: "409", message: "The resource already exists" } };
      objects.add(path);
      return { error: null };
    },
    async insert(row) {
      calls.insert += 1;
      // The insert policy refuses a find whose photo is not stored yet.
      if (!objects.has(row.photo_path)) return { error: { code: "42501", message: "row-level security" } };
      if (rows.has(row.id)) return { error: { code: "23505", message: "duplicate key value" } };
      rows.set(row.id, row);
      return { error: null };
    },
    async signUrl(_path, ttl) {
      calls.sign += 1;
      ttls.push(ttl);
      return SIGNED;
    },
    async emit(payload) {
      emitted.push(payload);
    },
    ...overrides,
  };
  return { deps, objects, rows, calls, emitted, ttls };
}

describe("findPhotoPath", () => {
  it("builds finds/<photo id>.<ext> from the mime type, and refuses other types", () => {
    expect(findPhotoPath(PHOTO, "image/jpeg")).toBe(`finds/${PHOTO}.jpg`);
    expect(findPhotoPath(PHOTO, "image/png")).toBe(`finds/${PHOTO}.png`);
    expect(findPhotoPath(PHOTO, "image/webp")).toBe(`finds/${PHOTO}.webp`);
    expect(findPhotoPath(PHOTO, "image/heic")).toBeNull();
    expect(findPhotoPath(PHOTO, "text/html")).toBeNull();
  });
});

describe("postFind", () => {
  it("stores the photo, then the row, then announces it with the photo link", async () => {
    const store = fakeStore();
    const result = await postFind(store.deps, INPUT, JPEG);
    expect(result).toEqual({ status: 201, body: { ok: true, status: "posted" } });
    expect(store.objects.has(`finds/${PHOTO}.jpg`)).toBe(true);
    expect(store.rows.get(PHOTO)).toEqual({
      id: PHOTO,
      zone_id: ZONE,
      note: "Grease behind the fryer",
      photo_path: `finds/${PHOTO}.jpg`,
    });
    expect(store.emitted).toEqual([
      { title: "Found and fixed", message: "Fryer line: Grease behind the fryer", image_url: SIGNED, findId: PHOTO },
    ]);
  });

  it("signs the Discord link for a year", async () => {
    const store = fakeStore();
    await postFind(store.deps, INPUT, JPEG);
    expect(store.ttls).toEqual([FIND_URL_TTL_SECONDS]);
    expect(FIND_URL_TTL_SECONDS).toBe(365 * 24 * 60 * 60);
  });

  it("never puts a person in the announcement", async () => {
    const store = fakeStore();
    await postFind(store.deps, INPUT, JPEG);
    expect(Object.keys(store.emitted[0]!).sort()).toEqual(["findId", "image_url", "message", "title"]);
  });

  it("records one find and one announcement when the same shot is sent twice", async () => {
    const store = fakeStore();
    const first = await postFind(store.deps, INPUT, JPEG);
    const again = await postFind(store.deps, INPUT, JPEG);
    expect(first.body).toEqual({ ok: true, status: "posted" });
    expect(again).toEqual({ status: 200, body: { ok: true, status: "duplicate" } });
    expect(store.rows.size).toBe(1);
    expect(store.emitted).toHaveLength(1);
    expect(store.calls.sign).toBe(1);
  });

  it("finishes a try that died after the upload", async () => {
    const store = fakeStore();
    store.objects.add(`finds/${PHOTO}.jpg`);
    const result = await postFind(store.deps, INPUT, JPEG);
    expect(result.body).toEqual({ ok: true, status: "posted" });
    expect(store.rows.size).toBe(1);
  });

  it("keeps two different shots apart", async () => {
    const store = fakeStore();
    await postFind(store.deps, INPUT, JPEG);
    await postFind(store.deps, { ...INPUT, photoId: OTHER_PHOTO }, JPEG);
    expect(store.rows.size).toBe(2);
    expect(store.emitted).toHaveLength(2);
  });

  it("refuses an area that does not exist, and stores nothing", async () => {
    const store = fakeStore({}, { zone: null });
    const result = await postFind(store.deps, INPUT, JPEG);
    expect(result).toEqual({ status: 400, body: { ok: false, error: "That area is not available. Pick another one." } });
    expect(store.calls.upload).toBe(0);
    expect(store.calls.insert).toBe(0);
    expect(store.emitted).toHaveLength(0);
  });

  it("refuses an area that is switched off, and stores nothing", async () => {
    const store = fakeStore({}, { zone: { name: "Front counter", active: false } });
    const result = await postFind(store.deps, INPUT, JPEG);
    expect(result.status).toBe(400);
    expect(store.calls.upload).toBe(0);
  });

  it("answers 500 (retry) when the area lookup fails", async () => {
    const store = fakeStore({
      async zone() {
        return { zone: null, error: { message: "connection failure at 10.0.0.4" } };
      },
    });
    const result = await postFind(store.deps, INPUT, JPEG);
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain("10.0.0.4");
    expect(store.calls.upload).toBe(0);
  });

  it("asks the phone to retry when storage fails, and never writes the row", async () => {
    const store = fakeStore({
      async upload() {
        return { error: { statusCode: "500", message: "Internal" } };
      },
    });
    const result = await postFind(store.deps, INPUT, JPEG);
    expect(result.status).toBe(500);
    expect(store.calls.insert).toBe(0);
    expect(store.emitted).toHaveLength(0);
  });

  it("answers 403 when the database refuses on permission, and announces nothing", async () => {
    const store = fakeStore({
      async insert() {
        return { error: { code: "42501", message: "new row violates row-level security policy" } };
      },
    });
    const result = await postFind(store.deps, INPUT, JPEG);
    expect(result.status).toBe(403);
    expect(store.emitted).toHaveLength(0);
  });

  it("answers 400 when the area was removed between the check and the insert", async () => {
    const store = fakeStore({
      async insert() {
        return { error: { code: "23503", message: "foreign key violation" } };
      },
    });
    expect((await postFind(store.deps, INPUT, JPEG)).status).toBe(400);
  });

  it("answers 500 (retry) on any other database error, without leaking its text", async () => {
    const store = fakeStore({
      async insert() {
        return { error: { code: "08006", message: "connection failure at 10.0.0.4" } };
      },
    });
    const result = await postFind(store.deps, INPUT, JPEG);
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain("10.0.0.4");
    expect(store.emitted).toHaveLength(0);
  });

  it("lets a thrown database call surface so the route answers 500", async () => {
    const store = fakeStore({
      async insert() {
        throw new Error("fetch failed");
      },
    });
    await expect(postFind(store.deps, INPUT, JPEG)).rejects.toThrow("fetch failed");
  });

  it("keeps the post when Discord fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = fakeStore({
      async emit() {
        throw new Error("emitEvent(cleaning_atd_find) failed: boom");
      },
    });
    const result = await postFind(store.deps, INPUT, JPEG);
    expect(result).toEqual({ status: 201, body: { ok: true, status: "posted" } });
    expect(store.rows.size).toBe(1);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("announces without the photo when the link cannot be made", async () => {
    const store = fakeStore({
      async signUrl() {
        throw new Error("storage down");
      },
    });
    const result = await postFind(store.deps, INPUT, JPEG);
    expect(result.status).toBe(201);
    expect(store.emitted).toEqual([
      { title: "Found and fixed", message: "Fryer line: Grease behind the fryer", findId: PHOTO },
    ]);
  });

  it("announces without the photo when signing returns nothing", async () => {
    const store = fakeStore({
      async signUrl() {
        return null;
      },
    });
    await postFind(store.deps, INPUT, JPEG);
    expect(store.emitted[0]).not.toHaveProperty("image_url");
  });

  it("refuses an image type the bucket does not take, and uploads nothing", async () => {
    const store = fakeStore();
    const result = await postFind(store.deps, INPUT, { bytes: JPEG_BYTES, contentType: "image/heic" });
    expect(result.status).toBe(400);
    expect(store.calls.upload).toBe(0);
  });

  it("stores a png under a .png path", async () => {
    const store = fakeStore();
    await postFind(store.deps, INPUT, { bytes: JPEG_BYTES, contentType: "image/png" });
    expect(store.rows.get(PHOTO)!.photo_path).toBe(`finds/${PHOTO}.png`);
  });
});

function body(parts: { photo?: File | string | null; payload?: unknown }): FormData {
  const form = new FormData();
  if (parts.photo !== null && parts.photo !== undefined) form.append("photo", parts.photo);
  if (parts.payload !== undefined) {
    form.append("payload", typeof parts.payload === "string" ? parts.payload : JSON.stringify(parts.payload));
  }
  return form;
}

const jpegFile = (type = "image/jpeg", bytes: Uint8Array = JPEG_BYTES) =>
  new File([bytes as BlobPart], "shot.jpg", { type });

describe("parseFindRequest", () => {
  it("accepts a real jpeg with a valid payload", async () => {
    const parsed = await parseFindRequest(body({ photo: jpegFile(), payload: INPUT }));
    expect(parsed).toMatchObject({ ok: true, input: INPUT, photo: { contentType: "image/jpeg" } });
  });

  it("trims the note", async () => {
    const parsed = await parseFindRequest(body({ photo: jpegFile(), payload: { ...INPUT, note: "  Dusty vent  " } }));
    expect(parsed).toMatchObject({ ok: true, input: { note: "Dusty vent" } });
  });

  it("requires both a photo file and a payload", async () => {
    expect(await parseFindRequest(body({ payload: INPUT }))).toMatchObject({ ok: false, status: 400 });
    expect(await parseFindRequest(body({ photo: jpegFile() }))).toMatchObject({ ok: false, status: 400 });
    expect(await parseFindRequest(body({ photo: "not-a-file", payload: INPUT }))).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a type the bucket does not take", async () => {
    expect(await parseFindRequest(body({ photo: jpegFile("image/heic"), payload: INPUT }))).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await parseFindRequest(body({ photo: jpegFile("text/html"), payload: INPUT }))).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("answers 400 for an empty photo and 413 for an oversized one", async () => {
    const empty = new File([], "empty.jpg", { type: "image/jpeg" });
    expect(await parseFindRequest(body({ photo: empty, payload: INPUT }))).toMatchObject({
      ok: false,
      status: 400,
      error: "Take a photo first.",
    });
    const big = jpegFile("image/jpeg", new Uint8Array(PHOTO_MAX_BYTES + 1));
    expect(await parseFindRequest(body({ photo: big, payload: INPUT }))).toMatchObject({ ok: false, status: 413 });
  });

  it("answers 400 for a payload that is not JSON or fails the schema", async () => {
    expect(await parseFindRequest(body({ photo: jpegFile(), payload: "{nope" }))).toMatchObject({ ok: false, status: 400 });
    expect(await parseFindRequest(body({ photo: jpegFile(), payload: { ...INPUT, zoneId: "x" } }))).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(await parseFindRequest(body({ photo: jpegFile(), payload: { ...INPUT, photoId: "../../etc/passwd" } }))).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("requires a note, and caps it at one line of 200 characters", async () => {
    const blank = await parseFindRequest(body({ photo: jpegFile(), payload: { ...INPUT, note: "   " } }));
    expect(blank).toMatchObject({ ok: false, status: 400, error: "Say what you found and fixed." });
    const long = await parseFindRequest(body({ photo: jpegFile(), payload: { ...INPUT, note: "x".repeat(201) } }));
    expect(long).toMatchObject({ ok: false, status: 400 });
    const edge = await parseFindRequest(body({ photo: jpegFile(), payload: { ...INPUT, note: "x".repeat(200) } }));
    expect(edge).toMatchObject({ ok: true });
  });

  it("refuses a file whose bytes are not the image it claims to be", async () => {
    const fake = jpegFile("image/jpeg", new TextEncoder().encode("<html><script>alert(1)</script></html>"));
    const parsed = await parseFindRequest(body({ photo: fake, payload: INPUT }));
    expect(parsed).toEqual({ ok: false, status: 400, error: "That file is not a valid image." });
  });

  it("ignores any storage path or poster the client tries to send", async () => {
    const parsed = await parseFindRequest(
      body({ photo: jpegFile(), payload: { ...INPUT, photoPath: "items/x.jpg", postedBy: "someone-else" } }),
    );
    expect(parsed.ok && Object.keys(parsed.input).sort()).toEqual(["note", "photoId", "zoneId"]);
  });
});
