"use server";

/**
 * Server actions for /setups: creating a setup from a template, assigning
 * positions, posting (which also generates the break plan), shift notes,
 * auto-place suggestions, and the shift-end Top Performer prompt. Follows
 * the permission-guard pattern documented in app/(app)/people/actions.ts.
 *
 * Permission split (matches lib/auth/permissions.ts's PERMISSION_KEYS
 * grouping and the seeded role tiers in supabase/migrations/
 * 20260707001900_seed_store_config.sql): `setups.manage` covers
 * building/assigning a setup (Shift Supervisor and above); `setups.post`
 * covers the shift-leader-level actions the brief calls out by name
 * ("Shift leader tooling: ... break management, Shift Notes... a prompt at
 * shift end to pick a Top Performer") plus posting itself, since Team
 * Leaders hold `setups.post` but not `setups.manage`.
 */

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { rankCandidatesForPosition } from "@/lib/setups/auto-place";
import { emitEvent } from "@/lib/events/bus";
import { generateBreaksForSetup } from "@/app/(app)/breaks/actions";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/setups/action-types";
import {
  addShiftNoteSchema,
  assignPositionSchema,
  createSetupSchema,
  postSetupSchema,
  removeAssignmentSchema,
  selectTopPerformerSchema,
  suggestAssigneesSchema,
} from "@/app/(app)/setups/validation";

function toActionError(error: unknown): string {
  if (error instanceof PermissionError) {
    return "You don't have permission to do this.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

function revalidateBoard() {
  revalidatePath("/setups");
  revalidatePath("/breaks");
}

/**
 * Creates a setup for a date + day-part from a template. Idempotent: if a
 * setup already exists for that exact date + day-part, returns the existing
 * one instead of creating a duplicate (guards double-submit of the "create"
 * button).
 */
export async function createSetup(
  input: z.infer<typeof createSetupSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("setups.manage");
    const parsed = createSetupSchema.parse(input);
    const supabase = await createClient();

    let existingQuery = supabase
      .from("setups")
      .select("id")
      .eq("date", parsed.date);
    existingQuery = parsed.dayPartId
      ? existingQuery.eq("day_part_id", parsed.dayPartId)
      : existingQuery.is("day_part_id", null);
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      return { ok: true, data: { id: existing.id } };
    }

    const { data, error } = await supabase
      .from("setups")
      .insert({
        date: parsed.date,
        day_part_id: parsed.dayPartId,
        template_id: parsed.templateId,
        shift_leader_id: parsed.shiftLeaderId,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create setup." };
    }

    // Seed one assignment row per template position so the board has a
    // row to assign into immediately (unassigned: user_id null).
    if (parsed.templateId) {
      const { data: templatePositions } = await supabase
        .from("setup_template_positions")
        .select("position_id")
        .eq("template_id", parsed.templateId)
        .order("sort");

      if (templatePositions && templatePositions.length > 0) {
        await supabase.from("setup_assignments").insert(
          templatePositions.map((tp) => ({ setup_id: data.id, position_id: tp.position_id })),
        );
      }
    }

    revalidateBoard();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Assigns (or reassigns/unassigns) a person to a position on a setup.
 * Idempotent: updates the existing assignment row for that position instead
 * of inserting a second one when called again.
 */
export async function assignPosition(
  input: z.infer<typeof assignPositionSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("setups.manage");
    const parsed = assignPositionSchema.parse(input);
    const supabase = await createClient();

    const arrivalTime = parsed.arrivalTime ? parsed.arrivalTime : null;

    const { data: existing } = await supabase
      .from("setup_assignments")
      .select("id")
      .eq("setup_id", parsed.setupId)
      .eq("position_id", parsed.positionId)
      .maybeSingle();

    const { error } = existing
      ? await supabase
          .from("setup_assignments")
          .update({ user_id: parsed.userId, arrival_time: arrivalTime })
          .eq("id", existing.id)
      : await supabase.from("setup_assignments").insert({
          setup_id: parsed.setupId,
          position_id: parsed.positionId,
          user_id: parsed.userId,
          arrival_time: arrivalTime,
        });

    if (error) return { ok: false, error: error.message };
    revalidateBoard();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function removeAssignment(
  input: z.infer<typeof removeAssignmentSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("setups.manage");
    const parsed = removeAssignmentSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("setup_assignments").delete().eq("id", parsed.id);

    if (error) return { ok: false, error: error.message };
    revalidateBoard();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Posts a setup: puts each person's position on their home screen (P2
 * wiring reads posted_at) and generates the day's break plan. Idempotent:
 * if the setup is already posted, this is a no-op that returns success
 * without re-emitting the event or regenerating breaks (guards double-post,
 * PLAN.md ground rules: "any action that can be double-submitted... must be
 * safe to run twice").
 */
export async function postSetup(
  input: z.infer<typeof postSetupSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("setups.post");
    const parsed = postSetupSchema.parse(input);
    const supabase = await createClient();

    const { data: setup, error: fetchError } = await supabase
      .from("setups")
      .select("id, posted_at")
      .eq("id", parsed.id)
      .single();

    if (fetchError || !setup) {
      return { ok: false, error: fetchError?.message ?? "Setup not found." };
    }

    if (setup.posted_at) {
      // Already posted — idempotent no-op.
      return { ok: true, data: undefined };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: assignments } = await supabase
      .from("setup_assignments")
      .select("position_id, user_id, arrival_time")
      .eq("setup_id", parsed.id);

    const { error: updateError } = await supabase
      .from("setups")
      .update({ posted_at: new Date().toISOString(), posted_by: user?.id ?? null })
      .eq("id", parsed.id)
      .is("posted_at", null); // guards a concurrent double-post race

    if (updateError) return { ok: false, error: updateError.message };

    await emitEvent("setup_posted", {
      setup_id: parsed.id,
      assignments: assignments ?? [],
    });

    // Break plan generation is its own idempotent operation (breaks are
    // only inserted for assignment+kind pairs that don't already exist).
    await generateBreaksForSetup(parsed.id);

    revalidateBoard();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function addShiftNote(
  input: z.infer<typeof addShiftNoteSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("setups.post");
    const parsed = addShiftNoteSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("shift_notes").insert({
      setup_id: parsed.setupId,
      author_id: user?.id ?? null,
      body: parsed.body,
    });

    if (error) return { ok: false, error: error.message };
    revalidateBoard();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Shift-end Top Performer prompt. Idempotent: only one top_performer event
 * per setup — checked by scanning app_events for an existing entry with
 * this setup_id before emitting a second one.
 */
export async function selectTopPerformer(
  input: z.infer<typeof selectTopPerformerSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("setups.post");
    const parsed = selectTopPerformerSchema.parse(input);
    const supabase = await createClient();

    const { data: existingEvents } = await supabase
      .from("app_events")
      .select("id, payload")
      .eq("event_key", "top_performer");

    const alreadySelected = (existingEvents ?? []).some((row) => {
      const payload = row.payload as { setup_id?: string } | null;
      return payload?.setup_id === parsed.setupId;
    });

    if (alreadySelected) {
      return { ok: false, error: "A Top Performer was already selected for this shift." };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    await emitEvent("top_performer", {
      setup_id: parsed.setupId,
      user_id: parsed.userId,
      selected_by: user?.id ?? null,
    });

    revalidateBoard();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Auto-place suggestion: ranks candidates for a position by position
 * rating. lib/setups/auto-place.ts's lookup is a STUB returning null for
 * every candidate until S4's position_ratings table is wired up in P2, so
 * today this only guarantees a deterministic (input-order) fallback.
 */
export async function suggestAssignees(
  input: z.infer<typeof suggestAssigneesSchema>,
): Promise<ActionResult<{ userIds: string[] }>> {
  try {
    await requirePermission("setups.manage");
    const parsed = suggestAssigneesSchema.parse(input);

    const ranked = await rankCandidatesForPosition(parsed.candidateUserIds, parsed.positionId);
    return { ok: true, data: { userIds: ranked.map((c) => c.userId) } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
