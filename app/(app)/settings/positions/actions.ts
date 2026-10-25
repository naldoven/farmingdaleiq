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
 * delete RPCs, still check setups.manage (20260707050000 and
 * 20260718010300). lib/auth/permissions.ts reports setups.manage as false
 * while the module is dormant, but has_permission() in SQL does not know
 * about lib/features.ts, so a role that holds the key in role_permissions
 * passes RLS. In the seed every role with settings.manage (Director,
 * Location Manager) also holds setups.manage. If an admin ever removes
 * setups.manage from such a role in the matrix, these writes will fail at
 * the database with a permission error, which is the fail-closed result.
 */

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/settings/positions/action-types";
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
import {
  SEED_DEFAULT_POSITION_GROUPS,
  hasSeedPositionGroups,
} from "@/app/(app)/setups/templates/constants";
import type {
  CreatePositionGroupInput,
  CreatePositionInput,
  DeletePositionGroupInput,
  DeletePositionInput,
  RenamePositionGroupInput,
  UpdatePositionInput,
} from "@/app/(app)/setups/templates/validation";

/**
 * A delete blocked by a remaining foreign key (Postgres 23503) means the
 * position is still wired into training (a roadmap station or a session).
 * Say so in plain words instead of the raw `..._fkey` string.
 */
function toDeleteError(error: { code?: string; message: string }): string {
  if (error.code === "23503") {
    return "This position is still used by a training roadmap or session and can't be deleted yet.";
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

    // The RPC clears each member position's passport, ratings, and setup
    // wiring first, then deletes the group (20260718010300). A bare delete
    // failed on passports_position_id_fkey.
    const { error } = await supabase.rpc("delete_position_group", { p_group_id: parsed.id });

    if (error) return { ok: false, error: toDeleteError(error) };
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

    // The RPC deletes the auto-created passport, ratings, re-rate prompts,
    // setup assignments, and layout tiles, then the position, atomically
    // (20260718010300). It raises 23503 if training still references it.
    const { error } = await supabase.rpc("delete_position", { p_position_id: parsed.id });

    if (error) return { ok: false, error: toDeleteError(error) };
    revalidatePositions();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Seeds the Avondale default list once. Gates on whether any of the seed's
 * own group names exist (not on "no groups at all", which never fires once
 * the training roadmap's FOH group is present), so a second tap finds the
 * five names and inserts nothing.
 */
export async function seedDefaultPositions(): Promise<ActionResult<{ inserted: number }>> {
  try {
    await requirePermission("settings.manage");
    const supabase = await createClient();

    const { data: existingGroups, error: readError } = await supabase.from("position_groups").select("name");
    if (readError) return { ok: false, error: readError.message };
    if (hasSeedPositionGroups((existingGroups ?? []).map((g) => g.name))) {
      return { ok: true, data: { inserted: 0 } };
    }

    let inserted = 0;
    for (const [groupIndex, group] of SEED_DEFAULT_POSITION_GROUPS.entries()) {
      const { data: groupRow, error: groupError } = await supabase
        .from("position_groups")
        .insert({ name: group.name, sort: groupIndex })
        .select("id")
        .single();
      if (groupError || !groupRow) return { ok: false, error: groupError?.message ?? "Could not seed positions." };

      const rows = group.positions.map((name, sort) => ({ group_id: groupRow.id, name, sort }));
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
