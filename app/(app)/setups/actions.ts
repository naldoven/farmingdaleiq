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
import { createPositionRatingLookup, loadPositionSuitability } from "@/lib/integration/position-ratings";
import { materializeSetupFanout } from "@/lib/integration/setup-fanout";
import { emitEvent } from "@/lib/events/bus";
import { generateBreaksForSetup } from "@/app/(app)/breaks/actions";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, SuggestedCandidate } from "@/app/(app)/setups/action-types";
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

    if (error) {
      // FIQ-11: a concurrent create for the same date + day-part won the
      // unique index (setups_date_daypart_uq / setups_date_null_daypart_uq);
      // return the setup that landed instead of surfacing a 23505 error.
      if (error.code === "23505") {
        let dupQuery = supabase.from("setups").select("id").eq("date", parsed.date);
        dupQuery = parsed.dayPartId
          ? dupQuery.eq("day_part_id", parsed.dayPartId)
          : dupQuery.is("day_part_id", null);
        const { data: dup } = await dupQuery.maybeSingle();
        if (dup) return { ok: true, data: { id: dup.id } };
      }
      return { ok: false, error: error.message };
    }
    if (!data) {
      return { ok: false, error: "Could not create setup." };
    }

    // Seed one assignment row per template position so the board has a
    // row to assign into immediately (unassigned: user_id null). Upsert on
    // (setup_id, position_id) so a re-run never duplicates a seed row
    // (FIQ-15).
    if (parsed.templateId) {
      const { data: templatePositions } = await supabase
        .from("setup_template_positions")
        .select("position_id")
        .eq("template_id", parsed.templateId)
        .order("sort");

      if (templatePositions && templatePositions.length > 0) {
        await supabase.from("setup_assignments").upsert(
          templatePositions.map((tp) => ({ setup_id: data.id, position_id: tp.position_id })),
          { onConflict: "setup_id,position_id", ignoreDuplicates: true },
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

    // FIQ-15: upsert on (setup_id, position_id) so concurrent assigns to the
    // same slot update one row instead of racing to create a duplicate that
    // the board would show twice and break sequencing could double-count.
    const { error } = await supabase.from("setup_assignments").upsert(
      {
        setup_id: parsed.setupId,
        position_id: parsed.positionId,
        user_id: parsed.userId,
        arrival_time: arrivalTime,
      },
      { onConflict: "setup_id,position_id" },
    );

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
      .select("id, posted_at, shift_leader_id")
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

    const { data: claimed, error: updateError } = await supabase
      .from("setups")
      .update({ posted_at: new Date().toISOString(), posted_by: user?.id ?? null })
      .eq("id", parsed.id)
      .is("posted_at", null) // guards a concurrent double-post race
      .select("id");

    if (updateError) return { ok: false, error: updateError.message };

    // A 0-row update means a concurrent call already claimed this setup
    // (the .is("posted_at", null) filter matched nothing). Supabase returns
    // no error for that case, so without this guard both callers would fall
    // through and emit setup_posted twice + regenerate breaks twice — both
    // fan out cross-module (S1/S2 auto-assign, token rules). Bail out as an
    // idempotent no-op instead.
    if (!claimed || claimed.length === 0) {
      return { ok: true, data: undefined };
    }

    // Recipient ids for the notification fan-out (lib/notify/recipients.ts
    // reads `user_ids`) so every assigned person gets a "you're on the
    // schedule" notification, and a leader id so S2's setup_posted -> lead_duty
    // consumer (app/(app)/tasks/system-tasks.ts) can create the Lead Duties
    // task. Without these top-level fields the payload's `assignments` array
    // is invisible to both consumers.
    const assignedUserIds = [
      ...new Set((assignments ?? []).map((a) => a.user_id).filter((id): id is string => Boolean(id))),
    ];
    const leaderUserId = setup.shift_leader_id ?? user?.id ?? null;

    await emitEvent("setup_posted", {
      setup_id: parsed.id,
      assignments: assignments ?? [],
      user_ids: assignedUserIds,
      leader_user_id: leaderUserId,
    });

    // Break plan generation is its own idempotent operation (breaks are
    // only inserted for assignment+kind pairs that don't already exist).
    await generateBreaksForSetup(parsed.id);

    // P2 wiring (S3 -> S1/S2): materialize the position-linked checklist runs
    // and tasks for the assigned people. Best-effort — the nightly checklist
    // and tasks crons materialize the same schedules/templates regardless of
    // setup, so a failure here degrades to "runs/tasks exist but aren't yet
    // attached to the assignee" rather than losing them. Idempotent, so a
    // manual re-run recovers the attach.
    try {
      await materializeSetupFanout(parsed.id);
      revalidatePath("/checklists");
      revalidatePath("/tasks");
    } catch (fanoutError) {
      console.error("postSetup: materializeSetupFanout failed", fanoutError);
    }

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

    // app_events is no longer directly readable by the authenticated client
    // (FIQ-02); use the narrow SECURITY DEFINER lookup instead.
    const { data: alreadySelected } = await supabase.rpc("setup_has_top_performer", {
      p_setup_id: parsed.setupId,
    });

    if (alreadySelected === true) {
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
 * Auto-place suggestion (P2 wiring, S3 -> S4): ranks candidates for a position
 * by their REAL current position rating (lib/integration/position-ratings.ts
 * reads S4's position_ratings) and flags anyone under the 3-star bar or
 * without the position passport stamp, so the board can warn before placing
 * an under-qualified person. Higher-rated candidates sort first; unrated
 * candidates sort last in stable input order.
 */
export async function suggestAssignees(
  input: z.infer<typeof suggestAssigneesSchema>,
): Promise<ActionResult<{ userIds: string[]; candidates: SuggestedCandidate[] }>> {
  try {
    await requirePermission("setups.manage");
    const parsed = suggestAssigneesSchema.parse(input);
    const supabase = await createClient();

    const lookup = createPositionRatingLookup(supabase);
    const ranked = await rankCandidatesForPosition(parsed.candidateUserIds, parsed.positionId, lookup);
    const suitability = await loadPositionSuitability(
      supabase,
      parsed.candidateUserIds,
      parsed.positionId,
    );

    const candidates: SuggestedCandidate[] = ranked.map((c) => {
      const s = suitability.get(c.userId);
      return {
        userId: c.userId,
        rating: c.rating,
        underThreeStars: s?.underThreeStars ?? c.rating === null,
        unstampedPassport: s?.unstampedPassport ?? false,
      };
    });

    return { ok: true, data: { userIds: candidates.map((c) => c.userId), candidates } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
