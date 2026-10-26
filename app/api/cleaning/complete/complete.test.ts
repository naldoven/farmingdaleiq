// @vitest-environment node
import { describe, expect, it } from "vitest";

import { PHOTO_MAX_BYTES } from "@/app/(app)/cleaning/constants";
import { completeClean, completionPhotoPath, parseCompleteRequest, type CompleteDeps } from "./complete";

const ASSIGNMENT = "11111111-1111-4111-8111-111111111111";
const PHOTO = "22222222-2222-4222-8222-222222222222";
const OTHER_PHOTO = "33333333-3333-4333-8333-333333333333";
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const JPEG = { bytes: JPEG_BYTES, contentType: "image/jpeg" };
const INPUT = { assignmentId: ASSIGNMENT, photoId: PHOTO, notNeeded: false };

type CompleteArgs = Parameters<CompleteDeps["complete"]>[0];

/**
 * A fake that behaves like the storage bucket and complete_cleaning_assignment:
 * it remembers uploads, locks a clean to its first photo, and refuses a photo
 * path another clean already holds.
 */
function fakeStore(overrides: Partial<CompleteDeps> = {}, opts: { ifNeeded?: boolean; status?: string } = {}) {
  const objects = new Set<string>();
  const calls = { upload: 0, complete: 0 };
  const completeArgs: CompleteArgs[] = [];
  const done = new Map<string, string>();
  const usedPaths = new Map<string, string>();
  const state = { status: opts.status ?? "planned" };
  const deps: CompleteDeps = {
    async upload(path) {
      calls.upload += 1;
      if (objects.has(path)) return { error: { statusCode: "409", message: "The resource already exists" } };
      objects.add(path);
      return { error: null };
    },
    async complete(args) {
      calls.complete += 1;
      completeArgs.push(args);
      if (!objects.has(args.photoPath)) return { result: "no_photo", error: null };
      const existing = done.get(args.assignmentId);
      if (existing) return { result: existing === args.photoPath ? "done" : "already_done", error: null };
      if (state.status !== "planned") return { result: "not_open", error: null };
      if (args.notNeeded && !opts.ifNeeded) return { result: "not_if_needed", error: null };
      const holder = usedPaths.get(args.photoPath);
      if (holder && holder !== args.assignmentId) {
        return { result: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
      }
      usedPaths.set(args.photoPath, args.assignmentId);
      done.set(args.assignmentId, args.photoPath);
      return { result: "done", error: null };
    },
    ...overrides,
  };
  return { deps, objects, calls, completeArgs, done };
}

describe("completionPhotoPath", () => {
  it("builds done/<photo id>.<ext> from the mime type, and refuses other types", () => {
    expect(completionPhotoPath(PHOTO, "image/jpeg")).toBe(`done/${PHOTO}.jpg`);
    expect(completionPhotoPath(PHOTO, "image/png")).toBe(`done/${PHOTO}.png`);
    expect(completionPhotoPath(PHOTO, "image/webp")).toBe(`done/${PHOTO}.webp`);
    expect(completionPhotoPath(PHOTO, "image/heic")).toBeNull();
    expect(completionPhotoPath(PHOTO, "text/html")).toBeNull();
  });
});

describe("completeClean", () => {
  it("stores the photo, then marks the clean done with that path", async () => {
    const store = fakeStore();
    const result = await completeClean(store.deps, INPUT, JPEG);
    expect(result).toEqual({ status: 200, body: { ok: true, status: "done" } });
    expect(store.objects.has(`done/${PHOTO}.jpg`)).toBe(true);
    expect(store.completeArgs).toEqual([{ assignmentId: ASSIGNMENT, photoPath: `done/${PHOTO}.jpg`, notNeeded: false }]);
  });

  it("passes 'checked, not needed' through for an if-needed clean", async () => {
    const store = fakeStore({}, { ifNeeded: true });
    const result = await completeClean(store.deps, { ...INPUT, notNeeded: true }, JPEG);
    expect(result.status).toBe(200);
    expect(store.completeArgs[0]!.notNeeded).toBe(true);
  });

  it("refuses 'not needed' on a clean that is not if-needed", async () => {
    const store = fakeStore();
    const result = await completeClean(store.deps, { ...INPUT, notNeeded: true }, JPEG);
    expect(result).toEqual({ status: 400, body: { ok: false, error: "This clean can't be marked not needed." } });
    expect(store.done.size).toBe(0);
  });

  it("records one completion when the same shot is sent twice (double tap or lost answer)", async () => {
    const store = fakeStore();
    const first = await completeClean(store.deps, INPUT, JPEG);
    const again = await completeClean(store.deps, INPUT, JPEG);
    expect(first.body).toEqual({ ok: true, status: "done" });
    expect(again.body).toEqual({ ok: true, status: "done" });
    expect(store.done.size).toBe(1);
    expect(store.done.get(ASSIGNMENT)).toBe(`done/${PHOTO}.jpg`);
  });

  it("finishes a try that died after the upload", async () => {
    const store = fakeStore();
    store.objects.add(`done/${PHOTO}.jpg`);
    const result = await completeClean(store.deps, INPUT, JPEG);
    expect(result.body).toEqual({ ok: true, status: "done" });
    expect(store.completeArgs).toHaveLength(1);
  });

  it("tells the phone it is fine when someone else finished the clean first", async () => {
    const store = fakeStore();
    await completeClean(store.deps, { ...INPUT, photoId: OTHER_PHOTO }, JPEG);
    const mine = await completeClean(store.deps, INPUT, JPEG);
    expect(mine).toEqual({ status: 200, body: { ok: true, status: "already_done" } });
    expect(store.done.get(ASSIGNMENT)).toBe(`done/${OTHER_PHOTO}.jpg`);
  });

  it("asks the phone to retry when storage fails, and never touches the clean", async () => {
    const store = fakeStore({
      async upload() {
        return { error: { statusCode: "500", message: "Internal" } };
      },
    });
    const result = await completeClean(store.deps, INPUT, JPEG);
    expect(result.status).toBe(500);
    expect(store.calls.complete).toBe(0);
  });

  it("answers 404 for a clean that does not exist", async () => {
    const store = fakeStore({
      async complete() {
        return { result: "not_found", error: null };
      },
    });
    expect((await completeClean(store.deps, INPUT, JPEG)).status).toBe(404);
  });

  it("answers 409 for a clean that was skipped or missed meanwhile", async () => {
    const store = fakeStore({}, { status: "skipped" });
    const result = await completeClean(store.deps, INPUT, JPEG);
    expect(result).toEqual({ status: 409, body: { ok: false, error: "This clean is no longer open." } });
    expect(store.done.size).toBe(0);
  });

  it("answers 500 when the database cannot see the photo it was just handed", async () => {
    const store = fakeStore({
      async complete() {
        return { result: "no_photo", error: null };
      },
    });
    expect((await completeClean(store.deps, INPUT, JPEG)).status).toBe(500);
  });

  it("answers 409 when the photo id already belongs to another clean", async () => {
    const store = fakeStore();
    await completeClean(store.deps, INPUT, JPEG);
    const reused = await completeClean(store.deps, { ...INPUT, assignmentId: "44444444-4444-4444-8444-444444444444" }, JPEG);
    expect(reused.status).toBe(409);
    expect(store.done.size).toBe(1);
  });

  it("answers 403 when the database refuses on permission", async () => {
    const store = fakeStore({
      async complete() {
        return { result: null, error: { code: "42501", message: "cleaning.complete required" } };
      },
    });
    expect((await completeClean(store.deps, INPUT, JPEG)).status).toBe(403);
  });

  it("answers 500 (retry) on any other database error, without leaking its text", async () => {
    const store = fakeStore({
      async complete() {
        return { result: null, error: { code: "08006", message: "connection failure at 10.0.0.4" } };
      },
    });
    const result = await completeClean(store.deps, INPUT, JPEG);
    expect(result.status).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain("10.0.0.4");
  });

  it("answers 500 for an answer it does not know", async () => {
    const store = fakeStore({
      async complete() {
        return { result: "mystery", error: null };
      },
    });
    expect((await completeClean(store.deps, INPUT, JPEG)).status).toBe(500);
  });

  it("lets a thrown database call surface so the route answers 500", async () => {
    const store = fakeStore({
      async complete() {
        throw new Error("fetch failed");
      },
    });
    await expect(completeClean(store.deps, INPUT, JPEG)).rejects.toThrow("fetch failed");
  });

  it("refuses an image type the bucket does not take, and uploads nothing", async () => {
    const store = fakeStore();
    const result = await completeClean(store.deps, INPUT, { bytes: JPEG_BYTES, contentType: "image/heic" });
    expect(result.status).toBe(400);
    expect(store.calls.upload).toBe(0);
  });

  it("stores a png under a .png path", async () => {
    const store = fakeStore();
    await completeClean(store.deps, INPUT, { bytes: JPEG_BYTES, contentType: "image/png" });
    expect(store.completeArgs[0]!.photoPath).toBe(`done/${PHOTO}.png`);
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

describe("parseCompleteRequest", () => {
  it("accepts a real jpeg with a valid payload", async () => {
    const parsed = await parseCompleteRequest(body({ photo: jpegFile(), payload: INPUT }));
    expect(parsed).toMatchObject({ ok: true, input: INPUT, photo: { contentType: "image/jpeg" } });
  });

  it("defaults notNeeded to false", async () => {
    const parsed = await parseCompleteRequest(body({ photo: jpegFile(), payload: { assignmentId: ASSIGNMENT, photoId: PHOTO } }));
    expect(parsed).toMatchObject({ ok: true, input: { notNeeded: false } });
  });

  it("requires both a photo file and a payload", async () => {
    expect(await parseCompleteRequest(body({ payload: INPUT }))).toMatchObject({ ok: false, status: 400 });
    expect(await parseCompleteRequest(body({ photo: jpegFile() }))).toMatchObject({ ok: false, status: 400 });
    expect(await parseCompleteRequest(body({ photo: "not-a-file", payload: INPUT }))).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a type the bucket does not take", async () => {
    const parsed = await parseCompleteRequest(body({ photo: jpegFile("image/heic"), payload: INPUT }));
    expect(parsed).toMatchObject({ ok: false, status: 400 });
    const html = await parseCompleteRequest(body({ photo: jpegFile("text/html"), payload: INPUT }));
    expect(html).toMatchObject({ ok: false, status: 400 });
  });

  it("answers 413 for an empty or oversized photo", async () => {
    const empty = new File([], "empty.jpg", { type: "image/jpeg" });
    expect(await parseCompleteRequest(body({ photo: empty, payload: INPUT }))).toMatchObject({ ok: false, status: 413 });
    const big = jpegFile("image/jpeg", new Uint8Array(PHOTO_MAX_BYTES + 1));
    expect(await parseCompleteRequest(body({ photo: big, payload: INPUT }))).toMatchObject({ ok: false, status: 413 });
  });

  it("answers 400 for a payload that is not JSON or fails the schema", async () => {
    expect(await parseCompleteRequest(body({ photo: jpegFile(), payload: "{nope" }))).toMatchObject({ ok: false, status: 400 });
    expect(await parseCompleteRequest(body({ photo: jpegFile(), payload: { assignmentId: "x", photoId: PHOTO } }))).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(
      await parseCompleteRequest(body({ photo: jpegFile(), payload: { assignmentId: ASSIGNMENT, photoId: "../../etc/passwd" } })),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a file whose bytes are not the image it claims to be", async () => {
    const fake = jpegFile("image/jpeg", new TextEncoder().encode("<html><script>alert(1)</script></html>"));
    const parsed = await parseCompleteRequest(body({ photo: fake, payload: INPUT }));
    expect(parsed).toEqual({ ok: false, status: 400, error: "That file is not a valid image." });
  });

  it("ignores any storage path or completer the client tries to send", async () => {
    const parsed = await parseCompleteRequest(
      body({ photo: jpegFile(), payload: { ...INPUT, photoPath: "items/x.jpg", completedBy: "someone-else" } }),
    );
    expect(parsed.ok && Object.keys(parsed.input).sort()).toEqual(["assignmentId", "notNeeded", "photoId"]);
  });
});
