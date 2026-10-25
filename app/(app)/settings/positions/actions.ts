"use server";

/**
 * Server actions for /settings/positions (docs/STORE-SETUP.md, area
 * "positions"). Positions and groups are read by Ratings (the skills matrix
 * columns) and Training (passports, roadmap stations), but the only editor
 * lived under /setups/templates, and the Setups module is switched off in
 * lib/features.ts. This file is the same CRUD behind a live route.
 *
 * Permission: requirePermission("settings.manage"), because positions are
 * store setup and settings.manage is the key the Store setup page already
 * uses. The RLS policies on position_groups and positions, and the two
 * delete RPCs, were written against setups.manage (20260707050000 and
 * 20260718010300), which Shift Supervisor and up hold. Migration
 * 20261025030000_positions_settings_manage.sql moves them to
 * settings.manage so the database enforces the same rule as these actions.
 * Apply it before this code ships; until then a role with settings.manage
 * but not setups.manage is refused at the database (fail closed).
 *
 * Deletes are guarded here, before the RPC runs: the RPCs erase a
 * position's ratings and its passport with every trainee's progress without
 * a word, so delete-guard.ts counts that history first and these actions
 * refuse when any exists.
 */

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/settings/positions/action-types";
import { deleteGuard } from "@/app/(app)/settings/positions/delete-guard";
import { shouldOfferDefaultList } from "@/app/(app)/settings/positions/logic";
import {
  createPositionGroupSchema,
  createPositionSchema,
  deletePositionGroupSchema,
  deletePositionSchema,
  renamePositionGroupSchema,
  reorderPositionsSchema,
  setPositionRateableSchema,
  updatePositionSchema,
  type ReorderPositionsInput,
  type SetPositionRateableInput,
} from "@/app/(app)/settings/positions/validation";
import { SEED_DEFAULT_POSITION_GROUPS } from "@/app/(app)/setups/templates/constants";
import type {
  CreatePositionGroupInput,
  CreatePositionInput,
  DeletePositionGroupInput,
  DeletePositionInput,
  RenamePositionGroupInput,
  UpdatePositionInput,
} from "@/app/(app)/setups/templates/validation";

/**
 * A delete blocked by a remaining foreign key (Postgres 23503) means
 * something the RPC does not clear still points at the position: a checklist
 * schedule or run, a task or task template, a training session, or an
 * onboarding roadmap station. Say so in plain words instead of the raw
 * `..._fkey` string.
 */
function toDeleteError(error: { code?: string; message: string }, subject: "position" | "group"): string {
  if (error.code === "23503") {
    const where = subject === "group" ? "A position in this group is" : "This position is";
    return `${where} still used by a checklist, a task, a training session, or an onboarding roadmap, so it can't be deleted. Take it off those first, or hide it from the Ratings matrix instead.`;
  }
  if (error.code === "42501") {
    return "You don't have permission to do this.";
  }
  return error.message;
}

function revalidatePositions(): void {
  revalidatePath("/settings/positions");
  // Readers of positions and groups outside this page.
  revalidatePath("/ratings");
  revalidatePath("/training");
  revalidatePath("/training/grid");
}

// Groups ---------------------------------------------------------------------

export async function createPositionGroup(
  input: CreatePositionGroupInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("settings.manage");
    const parsed = createPositionGroupSchema.parse(input);
    const supabase = await createClient();

    // New groups go last. Reading the current max keeps a hand-arranged
    // order intact instead of dropping the new card at sort 0 (the top).
    const { data: last } = await supabase
      .from("position_groups")
      .select("sort")
      .order("sort", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from("position_groups")
      .insert({ name: parsed.name, sort: (last?.sort ?? -1) + 1 })
      .select("id")
      .single();

    if (error || !data) return { ok: false, error: error?.message ?? "Could not create group." };
    revalidatePositions();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function renamePositionGroup(input: RenamePositionGroupInput): Promise<ActionResult> {
  try {
    await requirePermission("settings.manage");
    const parsed = renamePositionGroupSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("position_groups").update({ name: parsed.name }).eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };
    revalidatePositions();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deletePositionGroup(input: DeletePositionGroupInput): Promise<ActionResult> {
  try {
    await requirePermission("settings.manage");
    const parsed = deletePositionGroupSchema.parse(input);
    const supabase = await createClient();

    const { data: group, error: groupError } = await supabase
      .from("position_groups")
      .select("id, name")
      .eq("id", parsed.id)
      .maybeSingle();
    if (groupError) return { ok: false, error: groupError.message };
    // Already gone (a second tap, or another manager got there first).
    if (!group) {
      revalidatePositions();
      return { ok: true, data: undefined };
    }

    // Refuse when ANY position in the group has history; the RPC would erase
    // it for every member position.
    const { data: members, error: membersError } = await supabase
      .from("positions")
      .select("id")
      .eq("group_id", parsed.id);
    if (membersError) return { ok: false, error: membersError.message };
    const refusal = await deleteGuard(
      supabase,
      { kind: "group", name: group.name },
      (members ?? []).map((m) => m.id),
    );
    if (refusal) return { ok: false, error: refusal };

    // The RPC clears each member position's passport, ratings, and setup
    // wiring first, then deletes the group (20260718010300). A bare delete
    // failed on passports_position_id_fkey.
    const { error } = await supabase.rpc("delete_position_group", { p_group_id: parsed.id });

    if (error) return { ok: false, error: toDeleteError(error, "group") };
    revalidatePositions();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

// Positions ------------------------------------------------------------------

export async function createPosition(input: CreatePositionInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("settings.manage");
    const parsed = createPositionSchema.parse(input);
    const supabase = await createClient();

    // Append to the end of its group so a hand-arranged order survives.
    let lastQuery = supabase.from("positions").select("sort").order("sort", { ascending: false }).limit(1);
    lastQuery = parsed.groupId ? lastQuery.eq("group_id", parsed.groupId) : lastQuery.is("group_id", null);
    const { data: last } = await lastQuery.maybeSingle();

    const { data, error } = await supabase
      .from("positions")
      .insert({ group_id: parsed.groupId, name: parsed.name, sort: (last?.sort ?? -1) + 1 })
      .select("id")
      .single();

    if (error || !data) return { ok: false, error: error?.message ?? "Could not create position." };
    revalidatePositions();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updatePosition(input: UpdatePositionInput): Promise<ActionResult> {
  try {
    await requirePermission("settings.manage");
    const parsed = updatePositionSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("positions")
      .update({ group_id: parsed.groupId, name: parsed.name })
      .eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };
    revalidatePositions();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Rateable positions are the columns of the /ratings skills matrix
 * (20260718010200_positions_is_rateable.sql). Onboarding steps like
 * "Orientation" are not skills and should be switched off here.
 */
export async function setPositionRateable(input: SetPositionRateableInput): Promise<ActionResult> {
  try {
    await requirePermission("settings.manage");
    const parsed = setPositionRateableSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("positions").update({ is_rateable: parsed.isRateable }).eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };
    revalidatePositions();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Writes sort = index for every id in the list. Idempotent: sending the
 * same order twice writes the same values. One update per row; the list is
 * one group's positions, so this is a handful of writes, not a table scan.
 */
export async function reorderPositions(input: ReorderPositionsInput): Promise<ActionResult> {
  try {
    await requirePermission("settings.manage");
    const parsed = reorderPositionsSchema.parse(input);
    const supabase = await createClient();

    for (const [index, id] of parsed.orderedIds.entries()) {
      const { error } = await supabase.from("positions").update({ sort: index }).eq("id", id);
      if (error) return { ok: false, error: error.message };
    }

    revalidatePositions();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deletePosition(input: DeletePositionInput): Promise<ActionResult> {
  try {
    await requirePermission("settings.manage");
    const parsed = deletePositionSchema.parse(input);
    const supabase = await createClient();

    const { data: position, error: positionError } = await supabase
      .from("positions")
      .select("id, name")
      .eq("id", parsed.id)
      .maybeSingle();
    if (positionError) return { ok: false, error: positionError.message };
    // Already gone (a second tap, or another manager got there first).
    if (!position) {
      revalidatePositions();
      return { ok: true, data: undefined };
    }

    // Refuse when ratings, passport enrollments, or passport item records
    // exist; the RPC would erase them for good.
    const refusal = await deleteGuard(supabase, { kind: "position", name: position.name }, [position.id]);
    if (refusal) return { ok: false, error: refusal };

    // The RPC deletes the auto-created passport, ratings, re-rate prompts,
    // setup assignments, and layout tiles, then the position, atomically
    // (20260718010300). It raises 23503 if a checklist, task, training
    // session, or roadmap station still references the position.
    const { error } = await supabase.rpc("delete_position", { p_position_id: parsed.id });

    if (error) return { ok: false, error: toDeleteError(error, "position") };
    revalidatePositions();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Seeds the Avondale default list into an empty store. Gates on "there are
 * no positions at all", the same condition the banner uses
 * (shouldOfferDefaultList). The old gate looked for the five seed group
 * names, so after a manager renamed them a stale tab could add all 19
 * positions again under duplicate groups. Once any position exists, a second
 * tap inserts nothing.
 *
 * A group that already has a seed name (positions deleted, group kept) is
 * reused instead of duplicated.
 */
export async function seedDefaultPositions(): Promise<ActionResult<{ inserted: number }>> {
  try {
    await requirePermission("settings.manage");
    const supabase = await createClient();

    const { count: positionCount, error: countError } = await supabase
      .from("positions")
      .select("id", { count: "exact", head: true });
    if (countError || positionCount === null) {
      return { ok: false, error: countError?.message ?? "Could not check for existing positions." };
    }
    if (!shouldOfferDefaultList(positionCount)) {
      return { ok: true, data: { inserted: 0 } };
    }

    const { data: existingGroups, error: readError } = await supabase.from("position_groups").select("id, name");
    if (readError) return { ok: false, error: readError.message };
    const groupIdByName = new Map((existingGroups ?? []).map((g) => [g.name, g.id]));

    let inserted = 0;
    for (const [groupIndex, group] of SEED_DEFAULT_POSITION_GROUPS.entries()) {
      let groupId = groupIdByName.get(group.name);
      if (!groupId) {
        const { data: groupRow, error: groupError } = await supabase
          .from("position_groups")
          .insert({ name: group.name, sort: groupIndex })
          .select("id")
          .single();
        if (groupError || !groupRow) return { ok: false, error: groupError?.message ?? "Could not seed positions." };
        groupId = groupRow.id;
      }

      const rows = group.positions.map((name, sort) => ({ group_id: groupId, name, sort }));
      const { error: positionsError } = await supabase.from("positions").insert(rows);
      if (positionsError) return { ok: false, error: positionsError.message };
      inserted += rows.length;
    }

    revalidatePositions();
    return { ok: true, data: { inserted } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
