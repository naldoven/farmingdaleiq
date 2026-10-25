import { isStorageDuplicate, isUniqueViolation, photoStoragePath } from "@/app/(app)/cleaning/logic";
import type { WalkthroughSave } from "@/app/(app)/cleaning/validation";
import type { Database, Json } from "@/lib/db/types";

type ItemInsert = Database["public"]["Tables"]["cleaning_items"]["Insert"];
type PhotoInsert = Database["public"]["Tables"]["cleaning_item_photos"]["Insert"];

/**
 * The walkthrough save, separated from the route so every retry path is
 * unit-tested with fakes (save.test.ts).
 *
 * Every step is safe to repeat, because the phone resends whenever it is not
 * sure a save landed (lost response, dead wifi in the walk-in, a queue
 * restored after the tab closed). The phone's photo id is the photo row's
 * primary key AND the new item's id, so:
 *   1. photo row already there      -> done, report the existing item
 *   2. storage object already there -> keep going (an earlier try stopped after upload)
 *   3. item id already taken        -> keep going (an earlier try stopped after the item)
 *   4. photo row insert races       -> unique violation means another try won, done
 * The Quote Tool held restored mid-upload photos instead of resending because
 * its server could not dedupe; this one can, so the phone resends freely.
 *
 * Status codes drive the phone's send policy (lib/cleaning/send-policy.ts):
 * 2xx done, 5xx retry, other 4xx hold for a person.
 */

export interface SaveResult {
  status: number;
  body: { ok: true; itemId: string; duplicate: boolean } | { ok: false; error: string };
}

export interface SaveDeps {
  findPhoto(photoId: string): Promise<{ itemId: string } | null>;
  findItem(itemId: string): Promise<{ status: string } | null>;
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<{ error: { message?: string; statusCode?: string | number } | null }>;
  insertItem(row: ItemInsert): Promise<{ error: { code?: string; message: string } | null }>;
  insertPhoto(row: PhotoInsert): Promise<{ error: { code?: string; message: string } | null }>;
}

export async function saveWalkthroughPhoto(
  deps: SaveDeps,
  save: WalkthroughSave,
  photo: { bytes: Uint8Array; contentType: string },
): Promise<SaveResult> {
  const fail = (status: number, error: string): SaveResult => ({ status, body: { ok: false, error } });

  const already = await deps.findPhoto(save.photoId);
  if (already) {
    return { status: 200, body: { ok: true, itemId: already.itemId, duplicate: true } };
  }

  let itemId: string;
  if (save.target.mode === "existing") {
    const item = await deps.findItem(save.target.itemId);
    if (!item || item.status === "retired") {
      return fail(404, "That item is no longer on the master list.");
    }
    itemId = save.target.itemId;
  } else {
    itemId = save.photoId;
  }

  const path = photoStoragePath(save.photoId, photo.contentType);
  if (!path) return fail(400, "Only JPEG, PNG or WebP photos are allowed.");

  const uploaded = await deps.upload(path, photo.bytes, photo.contentType);
  if (uploaded.error && !isStorageDuplicate(uploaded.error)) {
    return fail(500, "Could not store the photo. It will try again.");
  }

  if (save.target.mode === "new") {
    const inserted = await deps.insertItem({ id: itemId, ...save.target.details, status: "draft" });
    if (inserted.error && !isUniqueViolation(inserted.error)) {
      // A check-constraint or RLS refusal will not fix itself on retry.
      const permanent = inserted.error.code === "23514" || inserted.error.code === "42501";
      return fail(permanent ? 400 : 500, permanent ? "That item could not be saved. Check its details." : "Could not save the item. It will try again.");
    }
  }

  const photoRow = await deps.insertPhoto({
    id: save.photoId,
    item_id: itemId,
    storage_path: path,
    markup: (save.markup ?? null) as Json,
    capture_source: save.captureSource,
    captured_at: save.capturedAt ?? null,
  });
  if (photoRow.error) {
    if (isUniqueViolation(photoRow.error)) {
      return { status: 200, body: { ok: true, itemId, duplicate: true } };
    }
    return fail(500, "Could not save the photo record. It will try again.");
  }

  return { status: 201, body: { ok: true, itemId, duplicate: false } };
}
