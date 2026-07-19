"use server";

/**
 * Org chart server actions (ARCHITECTURE.md "Trainee lifecycle" > "Org
 * chart"). Follows the People/Teams permission-guard pattern; gated by the
 * dedicated training.org_chart_manage key (not training.manage).
 */

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/people/org-chart/action-types";
import { buildVacantSlotRows } from "@/app/(app)/people/org-chart/logic";
import {
  assignSlotSchema,
  createSlotSchema,
  createTierSchema,
  deleteSlotSchema,
  deleteTierSchema,
  type AssignSlotInput,
  type CreateSlotInput,
  type CreateTierInput,
  type DeleteSlotInput,
  type DeleteTierInput,
} from "@/app/(app)/people/org-chart/validation";

/** Creates a tier and immediately provisions its goal_count vacant slots, so
 * a pipeline stamp (stampPassport in app/(app)/training/actions.ts) has a
 * slot to auto-fill right away instead of finding zero slots. */
export async function createTier(input: CreateTierInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("training.org_chart_manage");
    const parsed = createTierSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("org_tiers")
      .insert({ department: parsed.department, name: parsed.name, goal_count: parsed.goalCount, sort: parsed.sort })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create the tier." };
    }

    const slotRows = buildVacantSlotRows(data.id, parsed.goalCount);
    if (slotRows.length > 0) {
      const { error: slotsError } = await supabase.from("org_slots").insert(slotRows);
      if (slotsError) {
        return { ok: false, error: slotsError.message };
      }
    }

    revalidatePath("/people/org-chart");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteTier(input: DeleteTierInput): Promise<ActionResult> {
  try {
    await requirePermission("training.org_chart_manage");
    const parsed = deleteTierSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("org_tiers").delete().eq("id", parsed.id);
    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/people/org-chart");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function createSlot(input: CreateSlotInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("training.org_chart_manage");
    const parsed = createSlotSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("org_slots")
      .insert({ tier_id: parsed.tierId, label: parsed.label ? parsed.label : null, sort: parsed.sort })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create the slot." };
    }

    revalidatePath("/people/org-chart");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Manually fills or vacates a slot. Pipeline stamps auto-fill slots via
 * app/(app)/training/actions.ts's stampPassport; this is the manual override
 * path ("Slots show filled or vacant ... and are editable in place"). */
export async function assignSlot(input: AssignSlotInput): Promise<ActionResult> {
  try {
    await requirePermission("training.org_chart_manage");
    const parsed = assignSlotSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("org_slots").update({ user_id: parsed.userId }).eq("id", parsed.slotId);
    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/people/org-chart");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteSlot(input: DeleteSlotInput): Promise<ActionResult> {
  try {
    await requirePermission("training.org_chart_manage");
    const parsed = deleteSlotSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("org_slots").delete().eq("id", parsed.id);
    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/people/org-chart");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
