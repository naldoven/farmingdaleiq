"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/app/(app)/cleaning/action-types";
import { loadStoreClock, requireCleaningPlanner } from "@/app/(app)/cleaning/queries";
import { itemIdSchema, updateItemSchema, type ItemDetailsInput } from "@/app/(app)/cleaning/validation";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";

/**
 * Master-list actions for planners (docs/CLEANING-PLAN.md "Phase W": "Naldo
 * or a planner edits, approves, or deletes"). Walkthrough saves go through
 * app/api/cleaning/walkthrough instead, because they carry a photo.
 *
 * Planning rights are the cleaning.plan key OR the coordinator tag, so the
 * guard is requireCleaningPlanner rather than requirePermission; RLS on
 * cleaning_items re-checks the same can_plan_cleaning() helper.
 */

function revalidateCleaning() {
  revalidatePath("/cleaning/items");
  revalidatePath("/cleaning/walkthrough");
  revalidatePath("/cleaning");
  revalidatePath("/cleaning/week");
}

export async function updateItem(input: { id: string; details: ItemDetailsInput }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requireCleaningPlanner(supabase);
    const parsed = updateItemSchema.parse(input);

    const { error } = await supabase.from("cleaning_items").update(parsed.details).eq("id", parsed.id);
    if (error) return { ok: false, error: error.message };

    revalidateCleaning();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Draft to active. Filtering on status makes a double tap a no-op.
 *
 * A never-cleaned item is due from its start date, so approval stamps one
 * (today, store-local) when the item has none. Without it every approved
 * walkthrough item would count as due since forever and sort ahead of
 * weekly cleans that are genuinely overdue (PR #89 review).
 */
export async function approveItem(input: { id: string }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requireCleaningPlanner(supabase);
    const { id } = itemIdSchema.parse(input);
    const [
      {
        data: { user },
      },
      { today },
    ] = await Promise.all([supabase.auth.getUser(), loadStoreClock(supabase)]);

    const { data: approved, error } = await supabase
      .from("cleaning_items")
      .update({ status: "active", approved_by: user?.id ?? null, approved_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "draft")
      .select("id");
    if (error) return { ok: false, error: error.message };

    if (approved && approved.length > 0) {
      const { error: startError } = await supabase
        .from("cleaning_items")
        .update({ start_on: today })
        .eq("id", id)
        .is("start_on", null);
      if (startError) return { ok: false, error: startError.message };
    }

    revalidateCleaning();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Takes an active item off future weeks but keeps it and its photos as
 * history (plan failure-mode list: "A retired item disappears from future
 * weeks but keeps its history"). Its open cleans from tomorrow on come off
 * the board too; left there they would be closed out as misses against a
 * leader for a clean nobody was meant to do any more (PR #89 review). Today's
 * stays: it was owed when the shift started, and dropping it would let a
 * retire at close hide a miss. The database guard enforces the same line.
 */
export async function retireItem(input: { id: string }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requireCleaningPlanner(supabase);
    const { id } = itemIdSchema.parse(input);

    const { error } = await supabase.from("cleaning_items").update({ status: "retired" }).eq("id", id);
    if (error) return { ok: false, error: error.message };

    const { today } = await loadStoreClock(supabase);
    const { error: boardError } = await supabase
      .from("cleaning_assignments")
      .delete()
      .eq("item_id", id)
      .eq("status", "planned")
      .gt("date", today);
    if (boardError) return { ok: false, error: boardError.message };

    revalidateCleaning();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Deletes a draft (a duplicate or a bad shot from the walk). Only drafts:
 * an approved item has history and is retired instead. Photo rows cascade;
 * the stored image stays in the bucket, which has no client delete policy
 * by design (objects are immutable from the app).
 */
export async function deleteDraftItem(input: { id: string }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requireCleaningPlanner(supabase);
    const { id } = itemIdSchema.parse(input);

    const { error } = await supabase.from("cleaning_items").delete().eq("id", id).eq("status", "draft");
    if (error) return { ok: false, error: error.message };

    revalidateCleaning();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
