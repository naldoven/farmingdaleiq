"use server";

/**
 * Server actions for /setups/templates: position groups/positions, setup
 * templates + their ordered positions, and store layouts/tiles. Follows the
 * permission-guard pattern documented in app/(app)/people/actions.ts:
 * requirePermission() first, then a write through the per-request Supabase
 * client so RLS is the independent backstop.
 *
 * Every write here is gated on `setups.manage` (docs/agent-map.md: S3 owns
 * position_groups/positions/setup_templates/setup_template_positions/
 * store_layouts/layout_tiles).
 */

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { clampTileToBounds, moveTile } from "@/lib/setups/layout-grid";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/setups/action-types";
import {
  SEED_DEFAULT_POSITION_GROUPS,
  addTemplatePositionSchema,
  hasSeedPositionGroups,
  createLayoutSchema,
  createPositionGroupSchema,
  createPositionSchema,
  createSetupTemplateSchema,
  deleteLayoutSchema,
  deletePositionGroupSchema,
  deletePositionSchema,
  deleteSetupTemplateSchema,
  deleteTileSchema,
  moveTileSchema,
  removeTemplatePositionSchema,
  renamePositionGroupSchema,
  reorderTemplatePositionSchema,
  setLayoutActiveSchema,
  updatePositionSchema,
  upsertTileSchema,
} from "@/app/(app)/setups/templates/validation";

function toActionError(error: unknown): string {
  if (error instanceof PermissionError) {
    return "You don't have permission to do this.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

/**
 * SETB3: a delete blocked by a remaining foreign-key reference (Postgres
 * 23503) means the position is still wired into something the delete RPC does
 * not own (a training roadmap or a training session). Surface a plain-English
 * reason instead of the raw `..._fkey` Postgres string.
 */
function toDeleteError(error: { code?: string; message: string }): string {
  if (error.code === "23503") {
    return "This position is still used by a training roadmap or session and can't be deleted yet.";
  }
  return error.message;
}

function revalidateTemplates() {
  revalidatePath("/setups/templates");
  revalidatePath("/setups");
}

// Position groups & positions -------------------------------------------------

export async function createPositionGroup(
  input: z.infer<typeof createPositionGroupSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("setups.manage");
    const parsed = createPositionGroupSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("position_groups")
      .insert({ name: parsed.name })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create group." };
    }
    revalidateTemplates();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function renamePositionGroup(
  input: z.infer<typeof renamePositionGroupSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("setups.manage");
    const parsed = renamePositionGroupSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("position_groups")
      .update({ name: parsed.name })
      .eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };
    revalidateTemplates();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deletePositionGroup(
  input: z.infer<typeof deletePositionGroupSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("setups.manage");
    const parsed = deletePositionGroupSchema.parse(input);
    const supabase = await createClient();

    // SETB3: positions.group_id cascade-deletes with the group, but each of
    // those positions has an auto-created Position Passport (+ ratings, break
    // assignments, layout tiles) with no ON DELETE cascade, so the bare group
    // delete failed on passports_position_id_fkey. This RPC clears each
    // member position's dependents first, then deletes the group, atomically.
    const { error } = await supabase.rpc("delete_position_group", { p_group_id: parsed.id });

    if (error) return { ok: false, error: toDeleteError(error) };
    revalidateTemplates();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function createPosition(
  input: z.infer<typeof createPositionSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("setups.manage");
    const parsed = createPositionSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("positions")
      .insert({ group_id: parsed.groupId, name: parsed.name })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create position." };
    }
    revalidateTemplates();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updatePosition(
  input: z.infer<typeof updatePositionSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("setups.manage");
    const parsed = updatePositionSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("positions")
      .update({ group_id: parsed.groupId, name: parsed.name })
      .eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };
    revalidateTemplates();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deletePosition(
  input: z.infer<typeof deletePositionSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("setups.manage");
    const parsed = deletePositionSchema.parse(input);
    const supabase = await createClient();

    // SETB3: a plain positions delete always failed on passports_position_id_fkey
    // (every position auto-gets a Position Passport with no ON DELETE cascade).
    // The RPC deletes the passport + ratings + rerate prompts + setup
    // assignments + layout tiles, then the position, atomically.
    const { error } = await supabase.rpc("delete_position", { p_position_id: parsed.id });

    if (error) return { ok: false, error: toDeleteError(error) };
    revalidateTemplates();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Idempotent SEED-DEFAULT seeding (PLAN.md ground rules: "Where a
 * Farmingdale value is unknown, seed the Avondale default... mark it
 * SEED-DEFAULT"). Farmingdale's real position list is still an open
 * question (ARCHITECTURE.md "Open questions" #1).
 *
 * HIGH parity-audit fix: this used to gate on "position_groups is
 * completely empty", which no-ops forever once the unrelated
 * training-roadmap group ("FOH", from S4's onboarding stations) exists —
 * exactly the live-DB state. Gates instead on whether any of THIS seed's own
 * group names already exist, so it seeds the real setup positions
 * regardless of what other modules' groups are present, and is still safe
 * to click twice (a second click finds all 5 names already there and
 * inserts nothing).
 */
export async function seedDefaultPositions(): Promise<ActionResult<{ inserted: number }>> {
  try {
    await requirePermission("setups.manage");
    const supabase = await createClient();

    const { data: existingGroups, error: countError } = await supabase
      .from("position_groups")
      .select("name");

    if (countError) return { ok: false, error: countError.message };
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

      if (groupError || !groupRow) {
        return { ok: false, error: groupError?.message ?? "Could not seed positions." };
      }

      const positionsToInsert = group.positions.map((name, sort) => ({
        group_id: groupRow.id,
        name,
        sort,
      }));

      const { error: positionsError } = await supabase.from("positions").insert(positionsToInsert);
      if (positionsError) return { ok: false, error: positionsError.message };
      inserted += positionsToInsert.length;
    }

    revalidateTemplates();
    return { ok: true, data: { inserted } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

// Setup templates -------------------------------------------------------------

export async function createSetupTemplate(
  input: z.infer<typeof createSetupTemplateSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("setups.manage");
    const parsed = createSetupTemplateSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("setup_templates")
      .insert({ name: parsed.name, day_part_id: parsed.dayPartId })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create template." };
    }
    revalidateTemplates();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteSetupTemplate(
  input: z.infer<typeof deleteSetupTemplateSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("setups.manage");
    const parsed = deleteSetupTemplateSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("setup_templates").delete().eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };
    revalidateTemplates();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function addTemplatePosition(
  input: z.infer<typeof addTemplatePositionSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("setups.manage");
    const parsed = addTemplatePositionSchema.parse(input);
    const supabase = await createClient();

    const { count } = await supabase
      .from("setup_template_positions")
      .select("template_id", { count: "exact", head: true })
      .eq("template_id", parsed.templateId);

    // Idempotent add: upsert on the composite primary key instead of a bare
    // insert, so re-submitting the same add doesn't error or duplicate.
    const { error } = await supabase
      .from("setup_template_positions")
      .upsert(
        { template_id: parsed.templateId, position_id: parsed.positionId, sort: count ?? 0 },
        { onConflict: "template_id,position_id" },
      );

    if (error) return { ok: false, error: error.message };
    revalidateTemplates();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function removeTemplatePosition(
  input: z.infer<typeof removeTemplatePositionSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("setups.manage");
    const parsed = removeTemplatePositionSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("setup_template_positions")
      .delete()
      .eq("template_id", parsed.templateId)
      .eq("position_id", parsed.positionId);

    if (error) return { ok: false, error: error.message };
    revalidateTemplates();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function reorderTemplatePosition(
  input: z.infer<typeof reorderTemplatePositionSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("setups.manage");
    const parsed = reorderTemplatePositionSchema.parse(input);
    const supabase = await createClient();

    const { data: rows, error: fetchError } = await supabase
      .from("setup_template_positions")
      .select("position_id, sort")
      .eq("template_id", parsed.templateId)
      .order("sort");

    if (fetchError) return { ok: false, error: fetchError.message };
    const ordered = rows ?? [];
    const index = ordered.findIndex((r) => r.position_id === parsed.positionId);
    if (index === -1) return { ok: false, error: "Position is not on this template." };

    const swapWith = parsed.direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= ordered.length) {
      // Already at the boundary — no-op, not an error (idempotent).
      return { ok: true, data: undefined };
    }

    const a = ordered[index];
    const b = ordered[swapWith];

    // LOW parity-audit fix: the two sort updates used to be separate
    // round-trips, so a mid-swap failure (network blip, connection drop)
    // between them could leave two rows sharing one sort value. A single
    // upsert call sends both rows' new sort in one statement, so either both
    // land or neither does.
    const { error: swapError } = await supabase.from("setup_template_positions").upsert(
      [
        { template_id: parsed.templateId, position_id: a.position_id, sort: b.sort },
        { template_id: parsed.templateId, position_id: b.position_id, sort: a.sort },
      ],
      { onConflict: "template_id,position_id" },
    );

    if (swapError) {
      return { ok: false, error: swapError.message };
    }

    revalidateTemplates();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

// Store layouts & tiles ---------------------------------------------------------

export async function createLayout(
  input: z.infer<typeof createLayoutSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("setups.manage");
    const parsed = createLayoutSchema.parse(input);
    const supabase = await createClient();

    // SETB6: store_layouts.active defaults true, so without this a brand-new
    // (still-empty) layout would instantly become the live posted board. New
    // layouts are created inactive; the existing Activate control publishes
    // one once its tiles are placed.
    const { data, error } = await supabase
      .from("store_layouts")
      .insert({ name: parsed.name, day_part_id: parsed.dayPartId, active: false })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create layout." };
    }
    revalidateTemplates();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function setLayoutActive(
  input: z.infer<typeof setLayoutActiveSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("setups.manage");
    const parsed = setLayoutActiveSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("store_layouts")
      .update({ active: parsed.active })
      .eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };
    revalidateTemplates();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteLayout(
  input: z.infer<typeof deleteLayoutSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("setups.manage");
    const parsed = deleteLayoutSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("store_layouts").delete().eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };
    revalidateTemplates();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function upsertTile(
  input: z.infer<typeof upsertTileSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("setups.manage");
    const parsed = upsertTileSchema.parse(input);
    const clamped = clampTileToBounds(parsed);
    const supabase = await createClient();

    // FIQ-17: a real upsert on (layout_id, position_id) so a double-click
    // re-places the same position's tile instead of stacking two tiles for
    // one slot. (Area-only tiles carry a null position_id and stay distinct.)
    const { data, error } = await supabase
      .from("layout_tiles")
      .upsert(
        {
          layout_id: parsed.layoutId,
          position_id: parsed.positionId,
          area_label: parsed.areaLabel ? parsed.areaLabel : null,
          x: clamped.x,
          y: clamped.y,
          w: clamped.w,
          h: clamped.h,
        },
        { onConflict: "layout_id,position_id" },
      )
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not place tile." };
    }
    revalidateTemplates();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function moveLayoutTile(
  input: z.infer<typeof moveTileSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("setups.manage");
    const parsed = moveTileSchema.parse(input);
    const supabase = await createClient();

    const { data: tile, error: fetchError } = await supabase
      .from("layout_tiles")
      .select("x, y, w, h")
      .eq("id", parsed.tileId)
      .single();

    if (fetchError || !tile) {
      return { ok: false, error: fetchError?.message ?? "Tile not found." };
    }

    const moved = moveTile(tile, { x: tile.x, y: tile.y }, { x: parsed.x, y: parsed.y });

    const { error } = await supabase
      .from("layout_tiles")
      .update({ x: moved.x, y: moved.y })
      .eq("id", parsed.tileId);

    if (error) return { ok: false, error: error.message };
    revalidateTemplates();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function deleteTile(
  input: z.infer<typeof deleteTileSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("setups.manage");
    const parsed = deleteTileSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("layout_tiles").delete().eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };
    revalidateTemplates();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
