"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/app/(app)/cleaning/action-types";
import { PHOTO_BUCKET } from "@/app/(app)/cleaning/constants";
import { loadStoreClock, requireCleaningPlanner } from "@/app/(app)/cleaning/queries";
import { convertFindSchema, findIdSchema, type ItemDetailsInput } from "@/app/(app)/cleaning/validation";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";

/**
 * Planner actions on the found-and-fixed log (docs/CLEANING-PLAN.md
 * "Decisions": ATD log: "A planner can turn a find into a master-list item").
 * Posting a find goes through app/api/cleaning/finds instead, because it
 * carries a photo.
 *
 * Planning rights are the cleaning.plan key OR the coordinator tag, so the
 * guard is requireCleaningPlanner; RLS on the finds and items tables
 * re-checks the same can_plan_cleaning() helper.
 */

function revalidateFinds() {
  revalidatePath("/cleaning/finds");
  revalidatePath("/cleaning/items");
}

/** `finds/<uuid>.<ext>`, the only shape the table's check constraint allows. */
const FIND_PHOTO_PATH = /^finds\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/**
 * Puts a find on the master list as an approved item. The planner is looking
 * at the find and filling in the cadence, so the item skips the draft step:
 * it is active from now, with a start date of store-local today (the same
 * stamp approveItem gives, so it is not "due since forever").
 *
 * Safe to tap twice:
 *   - a find that already points at an item answers ok without making another
 *   - two taps racing each make an item, but only one claims the find
 *     (converted_item_id is null in the update's filter); the loser removes
 *     the item it made and answers ok
 */
export async function convertFind(input: { findId: string; details: ItemDetailsInput }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requireCleaningPlanner(supabase);
    const parsed = convertFindSchema.parse(input);

    const { data: find, error: findError } = await supabase
      .from("cleaning_atd_finds")
      .select("id, photo_path, posted_at, converted_item_id")
      .eq("id", parsed.findId)
      .maybeSingle();
    if (findError) return { ok: false, error: findError.message };
    if (!find) return { ok: false, error: "That find was not found. It may have been deleted." };
    if (find.converted_item_id) {
      revalidateFinds();
      return { ok: true, data: undefined };
    }

    const [
      {
        data: { user },
      },
      { today },
    ] = await Promise.all([supabase.auth.getUser(), loadStoreClock(supabase)]);

    const itemId = crypto.randomUUID();
    const { error: itemError } = await supabase.from("cleaning_items").insert({
      id: itemId,
      ...parsed.details,
      status: "active",
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
      start_on: today,
    });
    if (itemError) return { ok: false, error: itemError.message };

    const { data: claimed, error: claimError } = await supabase
      .from("cleaning_atd_finds")
      .update({ converted_item_id: itemId })
      .eq("id", parsed.findId)
      .is("converted_item_id", null)
      .select("id");
    if (claimError || !claimed || claimed.length === 0) {
      // Another tap claimed the find first (or it was deleted), or the link
      // failed. Each leaves this item unlinked, and an unlinked duplicate on
      // the master list is worse than a retry, so take it back.
      await supabase.from("cleaning_items").delete().eq("id", itemId);
      if (claimError) return { ok: false, error: claimError.message };
      // Lost to another tap: the find is on the list, which is what this tap
      // wanted. Gone: say so, rather than report a success with nothing to
      // show for it (PR #95 review).
      const { data: still } = await supabase
        .from("cleaning_atd_finds")
        .select("converted_item_id")
        .eq("id", parsed.findId)
        .maybeSingle();
      revalidateFinds();
      if (!still) return { ok: false, error: "That find was deleted." };
      return { ok: true, data: undefined };
    }

    // The find's photo becomes the item's reference photo, so the master list
    // shows what "clean" is meant to look like. Best effort on purpose: the
    // item and the link are already saved, a failed copy only leaves the item
    // without a picture (a planner can add one), and failing the action now
    // would invite a retry that finds the find already converted.
    await copyFindPhoto(supabase, itemId, find.photo_path, find.posted_at);

    revalidateFinds();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

async function copyFindPhoto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  findPath: string,
  postedAt: string,
): Promise<void> {
  try {
    if (!FIND_PHOTO_PATH.test(findPath)) return;
    const extension = findPath.slice(findPath.lastIndexOf(".") + 1);
    // A fresh id: the photo row's key and its storage path both come from it
    // (cleaning_item_photos_path_matches_id), and the find keeps its own object.
    const photoId = crypto.randomUUID();
    const storagePath = `items/${photoId}.${extension}`;

    const { error: copyError } = await supabase.storage.from(PHOTO_BUCKET).copy(findPath, storagePath);
    if (copyError) return;

    // If this insert fails the copied object is left unreferenced in the
    // bucket, which is harmless.
    await supabase.from("cleaning_item_photos").insert({
      id: photoId,
      item_id: itemId,
      storage_path: storagePath,
      capture_source: "live",
      captured_at: postedAt,
    });
  } catch {
    // See the comment at the call site: the photo is optional.
  }
}

/**
 * Removes a find from the log (a duplicate, a bad shot, a post that should
 * not have been made). The stored photo stays in the bucket, which has no
 * client delete policy by design (objects are immutable from the app). A
 * find already on the master list stays, as the record of where that item
 * came from; the screen hides Delete for it and this holds the same line.
 * Deleting twice is a no-op.
 */
export async function deleteFind(input: { id: string }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requireCleaningPlanner(supabase);
    const { id } = findIdSchema.parse(input);

    const { data: deleted, error } = await supabase
      .from("cleaning_atd_finds")
      .delete()
      .eq("id", id)
      .is("converted_item_id", null)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!deleted || deleted.length === 0) {
      const { data: still } = await supabase.from("cleaning_atd_finds").select("id").eq("id", id).maybeSingle();
      if (still) return { ok: false, error: "That find is on the master list, so it stays in the log." };
    }

    revalidateFinds();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
