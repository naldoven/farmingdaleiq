"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/app/(app)/cleaning/action-types";
import { requireCleaningPlanner } from "@/app/(app)/cleaning/queries";
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

/** Draft to active. Filtering on status makes a double tap a no-op. */
export async function approveItem(input: { id: string }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requireCleaningPlanner(supabase);
    const { id } = itemIdSchema.parse(input);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("cleaning_items")
      .update({ status: "active", approved_by: user?.id ?? null, approved_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "draft");
    if (error) return { ok: false, error: error.message };

    revalidateCleaning();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Takes an active item off future weeks but keeps it and its photos as
 * history (plan failure-mode list: "A retired item disappears from future
 * weeks but keeps its history").
 */
export async function retireItem(input: { id: string }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requireCleaningPlanner(supabase);
    const { id } = itemIdSchema.parse(input);

    const { error } = await supabase.from("cleaning_items").update({ status: "retired" }).eq("id", id);
    if (error) return { ok: false, error: error.message };

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
