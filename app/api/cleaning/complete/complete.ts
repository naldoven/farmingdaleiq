import { PHOTO_MAX_BYTES } from "@/app/(app)/cleaning/constants";
import { isStorageDuplicate } from "@/app/(app)/cleaning/logic";
import { completeSchema } from "@/app/(app)/cleaning/validation";
import { hasMatchingImageSignature } from "@/lib/images/image-signature";

/**
 * Completing a clean, separated from the route so every retry path is
 * unit-tested with fakes (complete.test.ts).
 *
 * The phone makes the photo id once per shot and resends the same id after a
 * lost answer, so each step is safe to repeat:
 *   1. storage object already there -> keep going (an earlier try stopped after the upload)
 *   2. the database call finds the clean already done with this photo -> 'done' again
 *   3. the clean was finished by someone else meanwhile -> 'already_done', not an error
 * The photo goes to storage BEFORE the database call because
 * complete_cleaning_assignment refuses a clean whose photo is not stored
 * (plan "Proof": no clean counts as done without a photo).
 *
 * Status codes drive the phone: 2xx refresh, 5xx the Retry button works, other
 * 4xx need a person (a new photo or a refreshed page).
 */

export const COMPLETE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Chosen on the server from the phone's photo id, never sent by the client.
 * Matches the cleaning_assignments.photo_path check constraint and the
 * storage insert policy (`done/<uuid>.<ext>`).
 */
export function completionPhotoPath(photoId: string, mimeType: string): string | null {
  const extension = EXTENSION_BY_MIME[mimeType];
  return extension ? `done/${photoId}.${extension}` : null;
}

export interface CompleteInput {
  assignmentId: string;
  photoId: string;
  notNeeded: boolean;
}

export interface CompleteResult {
  status: number;
  body: { ok: true; status: "done" | "already_done" } | { ok: false; error: string };
}

export interface CompleteDeps {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<{ error: { message?: string; statusCode?: string | number } | null }>;
  /** complete_cleaning_assignment. `result` is its text answer. */
  complete(args: {
    assignmentId: string;
    photoPath: string;
    notNeeded: boolean;
  }): Promise<{ result: string | null; error: { code?: string; message: string } | null }>;
}

const fail = (status: number, error: string): CompleteResult => ({ status, body: { ok: false, error } });

export type ParsedCompleteRequest =
  | { ok: true; input: CompleteInput; photo: { bytes: Uint8Array; contentType: string } }
  | { ok: false; status: number; error: string };

/**
 * Reads the multipart body: the `photo` file and the JSON `payload`. Order
 * matters for cost: type and size are checked before the file is read into
 * memory, and the magic-byte check runs last on the bytes themselves, so a
 * renamed HTML or script file never reaches the bucket.
 */
export async function parseCompleteRequest(formData: FormData): Promise<ParsedCompleteRequest> {
  const file = formData.get("photo");
  const rawPayload = formData.get("payload");
  if (!(file instanceof File) || typeof rawPayload !== "string") {
    return { ok: false, status: 400, error: "Take a photo first." };
  }
  if (!(COMPLETE_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
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
  const parsed = completeSchema.safeParse(payload);
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

export async function completeClean(
  deps: CompleteDeps,
  input: CompleteInput,
  photo: { bytes: Uint8Array; contentType: string },
): Promise<CompleteResult> {
  const path = completionPhotoPath(input.photoId, photo.contentType);
  if (!path) return fail(400, "Only JPEG, PNG or WebP photos are allowed.");

  const uploaded = await deps.upload(path, photo.bytes, photo.contentType);
  if (uploaded.error && !isStorageDuplicate(uploaded.error)) {
    return fail(500, "Could not store the photo. Tap Retry.");
  }

  const { result, error } = await deps.complete({
    assignmentId: input.assignmentId,
    photoPath: path,
    notNeeded: input.notNeeded,
  });

  if (error) {
    // The photo path is unique per clean: another clean already holds this
    // photo id, so resending cannot help. The phone needs a new shot.
    if (error.code === "23505") return fail(409, "That photo was already used for another clean. Take a new one.");
    if (error.code === "42501") return fail(403, "You don't have permission to do this.");
    if (error.code === "22023") return fail(400, "That photo could not be used. Take a new one.");
    return fail(500, "Could not save. Tap Retry.");
  }

  switch (result) {
    case "done":
      return { status: 200, body: { ok: true, status: "done" } };
    // Someone else finished it first. Nothing more to do; the page refreshes
    // and shows their completion.
    case "already_done":
      return { status: 200, body: { ok: true, status: "already_done" } };
    case "not_found":
      return fail(404, "That clean was not found.");
    case "not_open":
      return fail(409, "This clean is closed. If it was missed, it is on today's list.");
    case "not_if_needed":
      return fail(400, "This clean can't be marked not needed.");
    // The database could not see the photo we just stored: a storage hiccup
    // that a retry usually clears.
    case "no_photo":
      return fail(500, "The photo did not save. Tap Retry.");
    default:
      return fail(500, "Could not save. Tap Retry.");
  }
}
