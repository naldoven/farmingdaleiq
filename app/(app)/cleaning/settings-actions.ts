"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/app/(app)/cleaning/action-types";
import { isUniqueViolation } from "@/app/(app)/cleaning/logic";
import { loadStoreClock, requireCleaningPlanner } from "@/app/(app)/cleaning/queries";
import { isCoordinatorEligible } from "@/app/(app)/cleaning/settings-view";
import {
  coordinatorSchema,
  slotCapsSchema,
  zoneActiveSchema,
} from "@/app/(app)/cleaning/validation";
import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";

/**
 * Cleaning settings actions (docs/CLEANING-PLAN.md "Screens": /cleaning/settings).
 *
 * Caps and zone switches are planner work, so they use requireCleaningPlanner
 * (the cleaning.plan key OR the coordinator tag). The tag itself is different:
 * only the role-level cleaning.plan key may hand it out, so a coordinator
 * cannot mint more coordinators. RLS on cleaning_coordinators enforces the
 * same split independently (cleaning_coordinators_write).
 */

function revalidateSettings() {
  revalidatePath("/cleaning/settings");
  // The board reads the caps and the active zones when it builds a week.
  revalidatePath("/cleaning/week");
  revalidatePath("/cleaning");
}

export async function saveSlotCaps(input: {
  caps: { weekday: number; half: "am" | "pm"; maxVariables: number }[];
}): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requireCleaningPlanner(supabase);
    const parsed = slotCapsSchema.parse(input);

    // One row per slot, last one wins: a repeated slot in a single upsert
    // makes Postgres refuse the whole statement.
    const bySlot = new Map(
      parsed.caps.map((cap) => [
        `${cap.weekday}|${cap.half}`,
        { weekday: cap.weekday, half: cap.half, max_variables: cap.maxVariables },
      ]),
    );

    const { error } = await supabase
      .from("cleaning_slot_caps")
      .upsert([...bySlot.values()], { onConflict: "weekday,half" });
    if (error) return { ok: false, error: error.message };

    revalidateSettings();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Puts a zone on or off the weekly board. Turning one on only affects the
 * next build: its items join then, and nothing already planned moves.
 */
export async function setZoneActive(input: { id: string; active: boolean }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requireCleaningPlanner(supabase);
    const { id, active } = zoneActiveSchema.parse(input);

    // select() so a zone id that matches nothing is an error, not a silent
    // "saved" (an update that matches no rows is not a database error).
    const { data, error } = await supabase.from("cleaning_zones").update({ active }).eq("id", id).select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) return { ok: false, error: "That zone was not found." };

    // A zone taken off the board takes its open cleans from today on with
    // it; left there they would be closed out as misses for work nobody was
    // meant to do (PR #89 review). Turning it back on brings items back at
    // the next build, or a planner pulls them in.
    if (!active) {
      const { data: items, error: itemsError } = await supabase.from("cleaning_items").select("id").eq("zone_id", id);
      if (itemsError) return { ok: false, error: itemsError.message };
      const itemIds = (items ?? []).map((i) => i.id);
      if (itemIds.length > 0) {
        const { today } = await loadStoreClock(supabase);
        const { error: boardError } = await supabase
          .from("cleaning_assignments")
          .delete()
          .in("item_id", itemIds)
          .eq("status", "planned")
          .gte("date", today);
        if (boardError) return { ok: false, error: boardError.message };
      }
    }

    revalidateSettings();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * The tag grants planning rights, so it goes only to an active leader or
 * trainer. The picker already filters this way; repeating the rule here keeps
 * a hand-built request from tagging a team member.
 */
async function assertEligible(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data: person, error } = await supabase
    .from("profiles")
    .select("active, role_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) return error.message;
  if (!person) return "That person was not found.";

  let rank: number | null = null;
  if (person.role_id) {
    const { data: role, error: roleError } = await supabase
      .from("roles")
      .select("rank")
      .eq("id", person.role_id)
      .maybeSingle();
    if (roleError) return roleError.message;
    rank = role?.rank ?? null;
  }

  return isCoordinatorEligible(person.active, rank)
    ? null
    : "Only active leaders and trainers can be cleaning coordinators.";
}

/** Already tagged counts as success, so a double tap or a stale list is harmless. */
export async function addCoordinator(input: { userId: string }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requirePermission("cleaning.plan");
    const { userId } = coordinatorSchema.parse(input);

    const problem = await assertEligible(supabase, userId);
    if (problem) return { ok: false, error: problem };

    // added_by fills from auth.uid() in the database, so the audit trail is
    // never taken from the request.
    const { error } = await supabase.from("cleaning_coordinators").insert({ user_id: userId });
    if (error && !isUniqueViolation(error)) return { ok: false, error: error.message };

    revalidateSettings();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Removing someone who is not tagged is already the wanted end state. */
export async function removeCoordinator(input: { userId: string }): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    await requirePermission("cleaning.plan");
    const { userId } = coordinatorSchema.parse(input);

    const { error } = await supabase.from("cleaning_coordinators").delete().eq("user_id", userId);
    if (error) return { ok: false, error: error.message };

    revalidateSettings();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
