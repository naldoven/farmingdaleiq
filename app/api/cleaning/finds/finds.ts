import { PHOTO_MAX_BYTES } from "@/app/(app)/cleaning/constants";
import { isStorageDuplicate, isUniqueViolation } from "@/app/(app)/cleaning/logic";
import { findSchema } from "@/app/(app)/cleaning/validation";
import { hasMatchingImageSignature } from "@/lib/images/image-signature";

/**
 * Posting a "found and fixed" (docs/CLEANING-PLAN.md "Decisions": ATD log),
 * separated from the route so every retry path is unit-tested with fakes
 * (finds.test.ts).
 *
 * The phone makes the photo id once per shot and resends the same id after a
 * lost answer. The photo id is also the row's primary key, so each step is
 * safe to repeat:
 *   1. storage object already there -> keep going (an earlier try stopped after the upload)
 *   2. row already there (23505)    -> 'duplicate', and nothing is announced again
 * The photo goes to storage BEFORE the row because the insert policy only
 * accepts a find whose photo is already stored under the caller's name.
 *
 * Status codes drive the phone: 2xx done, 5xx the Retry button works, other
 * 4xx need a person (a different area or a new photo).
 */

export const FIND_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Chosen on the server from the phone's photo id, never sent by the client.
 * Matches the cleaning_atd_finds.photo_path check constraint and the storage
 * insert policy (`finds/<uuid>.<ext>`).
 */
export function findPhotoPath(photoId: string, mimeType: string): string | null {
  const extension = EXTENSION_BY_MIME[mimeType];
  return extension ? `finds/${photoId}.${extension}` : null;
}

/**
 * Discord shows the photo from this link, and Discord cannot sign in, so it
 * has to be a signed URL that lasts. A year keeps the #cleaning history
 * readable. It is a cleaning photo (a vent, a floor), not something sensitive,
 * and the link only reaches people who can already read the channel.
 */
export const FIND_URL_TTL_SECONDS = 365 * 24 * 60 * 60;

export interface FindInput {
  photoId: string;
  zoneId: string;
  note: string;
}

export interface FindResult {
  status: number;
  body: { ok: true; status: "posted" | "duplicate" } | { ok: false; error: string };
}

type DbError = { code?: string; message: string };

export interface FindDeps {
  /** The area the find is filed under. `zone` is null when no such area exists. */
  zone(zoneId: string): Promise<{ zone: { name: string; active: boolean } | null; error: DbError | null }>;
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<{ error: { message?: string; statusCode?: string | number } | null }>;
  /** The row insert. The poster is NOT passed: the column defaults to auth.uid(). */
  insert(row: { id: string; zone_id: string; note: string; photo_path: string }): Promise<{ error: DbError | null }>;
  /** A signed link for the stored photo, or null when it could not be made. */
  signUrl(path: string, ttlSeconds: number): Promise<string | null>;
  /** Emits the cleaning_atd_find event. */
  emit(payload: Record<string, unknown>): Promise<void>;
}

const fail = (status: number, error: string): FindResult => ({ status, body: { ok: false, error } });

export type ParsedFindRequest =
  | { ok: true; input: FindInput; photo: { bytes: Uint8Array; contentType: string } }
  | { ok: false; status: number; error: string };

/**
 * Reads the multipart body: the `photo` file and the JSON `payload`. Order
 * matters for cost: type and size are checked before the file is read into
 * memory, and the magic-byte check runs last on the bytes themselves, so a
 * renamed HTML or script file never reaches the bucket.
 */
export async function parseFindRequest(formData: FormData): Promise<ParsedFindRequest> {
  const file = formData.get("photo");
  const rawPayload = formData.get("payload");
  if (!(file instanceof File) || typeof rawPayload !== "string") {
    return { ok: false, status: 400, error: "Take a photo first." };
  }
  if (!(FIND_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, status: 400, error: "Only JPEG, PNG or WebP photos are allowed." };
  }
  if (file.size === 0 || file.size > PHOTO_MAX_BYTES) {
    return { ok: false, status: 413, error: "Photo is too large." };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return { ok: false, status: 400, error: "The details were unreadable." };
  }
  const parsed = findSchema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).filter(Boolean).join("; ");
    return { ok: false, status: 400, error: message || "Check the details and try again." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasMatchingImageSignature(file.type, bytes)) {
    return { ok: false, status: 400, error: "That file is not a valid image." };
  }
  return { ok: true, input: parsed.data, photo: { bytes, contentType: file.type } };
}

export async function postFind(
  deps: FindDeps,
  input: FindInput,
  photo: { bytes: Uint8Array; contentType: string },
): Promise<FindResult> {
  const path = findPhotoPath(input.photoId, photo.contentType);
  if (!path) return fail(400, "Only JPEG, PNG or WebP photos are allowed.");

  // Before the upload, so a bad area never leaves an orphan photo in the bucket.
  const { zone, error: zoneError } = await deps.zone(input.zoneId);
  if (zoneError) return fail(500, "Could not check the area. Tap Retry.");
  if (!zone || !zone.active) return fail(400, "That area is not available. Pick another one.");

  const uploaded = await deps.upload(path, photo.bytes, photo.contentType);
  if (uploaded.error && !isStorageDuplicate(uploaded.error)) {
    return fail(500, "Could not store the photo. Tap Retry.");
  }

  const { error } = await deps.insert({
    id: input.photoId,
    zone_id: input.zoneId,
    note: input.note,
    photo_path: path,
  });
  if (error) {
    // A retry of the same post. The first try already announced it (or tried
    // to), so announcing again would double-post in #cleaning.
    if (isUniqueViolation(error)) return { status: 200, body: { ok: true, status: "duplicate" } };
    if (error.code === "42501") return fail(403, "You don't have permission to do this.");
    // The area was removed between the check and the insert; resending cannot help.
    if (error.code === "23503") return fail(400, "That area is not available. Pick another one.");
    return fail(500, "Could not save. Tap Retry.");
  }

  await announce(deps, path, zone.name, input);
  return { status: 201, body: { ok: true, status: "posted" } };
}

/**
 * The #cleaning post: the area, the note and the photo, never the poster
 * (docs/CLEANING-PLAN.md "Discord": item names only, never people). The find
 * is already saved, so nothing here may fail the request: a Discord problem
 * is logged and the leader still sees their post. A crash between the insert
 * and this call loses the announcement and a retry will not resend it, which
 * is the cheaper mistake than posting the same find twice.
 */
async function announce(deps: FindDeps, path: string, zoneName: string, input: FindInput): Promise<void> {
  try {
    let imageUrl: string | null = null;
    try {
      imageUrl = await deps.signUrl(path, FIND_URL_TTL_SECONDS);
    } catch {
      // Post the text without the photo rather than not at all.
    }
    await deps.emit({
      title: "Found and fixed",
      message: `${zoneName}: ${input.note}`,
      ...(imageUrl ? { image_url: imageUrl } : {}),
      findId: input.photoId,
    });
  } catch (error) {
    console.error("cleaning find: could not announce to Discord", error);
  }
}
