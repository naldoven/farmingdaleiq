"use server";

/**
 * Server actions for the run-player side of Checklists (ARCHITECTURE.md
 * "Checklists"). Follows the People/Teams permission-guard pattern (see
 * app/(app)/people/actions.ts): every action calls requirePermission() before
 * any DB write, mutations go through the per-request client (so RLS
 * independently re-checks has_permission()), and actions return a
 * discriminated ActionResult instead of throwing.
 *
 * Idempotency (PLAN.md ground rules): startRun, saveAnswers, completeRun, and
 * resolveFollowUp are all safe to call twice with the same arguments --
 * completeRun in particular short-circuits once a run is already completed so
 * a double-submit cannot double-emit events or double-create follow_ups.
 */

import { revalidatePath } from "next/cache";

import { emitEvent } from "@/lib/events/bus";
import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/checklists/action-types";
import {
  evaluateAnswer,
  planFollowUpInserts,
  validateSubmission,
  type AnswerValue,
  type FoodItemRangeLike,
  type QuestionLike,
} from "@/app/(app)/checklists/logic";
import {
  followUpIdSchema,
  runIdSchema,
  saveAnswersSchema,
  type SaveAnswersInput,
} from "@/app/(app)/checklists/validation";

function toActionError(error: unknown): string {
  if (error instanceof PermissionError) {
    return "You don't have permission to do this.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

function revalidateRun(runId: string) {
  revalidatePath("/checklists");
  revalidatePath(`/checklists/${runId}`);
}

/**
 * Best-effort event emission: the checklist_runs/checklist_answers/follow_ups
 * mutations above are the source of truth for "did this run complete"; event
 * emission is notification-side plumbing consumed by other streams (S7
 * tokens, S10 notifications/Discord). It must never turn a successful
 * completion into a reported failure -- known gap: `app_events` has no RLS
 * policy yet (see this stream's final report), so emitEvent can currently
 * throw for every caller, not just this one, until that's added.
 */
async function emitEventSafely(...args: Parameters<typeof emitEvent>): Promise<void> {
  try {
    await emitEvent(...args);
  } catch (error) {
    console.error(`checklists: emitEvent(${args[0]}) failed`, error);
  }
}

/** Marks a run in_progress the first time someone opens it. Safe to call repeatedly. */
export async function startRun(input: { runId: string }): Promise<ActionResult> {
  try {
    await requirePermission("checklists.complete");
    const { runId } = runIdSchema.parse(input);
    const supabase = await createClient();

    const { data: run, error: runError } = await supabase
      .from("checklist_runs")
      .select("id, status")
      .eq("id", runId)
      .maybeSingle();

    if (runError) return { ok: false, error: runError.message };
    if (!run) return { ok: false, error: "Checklist run not found." };

    if (run.status === "pending") {
      const { error } = await supabase
        .from("checklist_runs")
        .update({ status: "in_progress", started_at: new Date().toISOString() })
        .eq("id", runId)
        .eq("status", "pending");
      if (error) return { ok: false, error: error.message };
    }

    revalidateRun(runId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Upserts answers for a run without completing it (autosave / "save progress"). */
export async function saveAnswers(input: SaveAnswersInput): Promise<ActionResult> {
  try {
    await requirePermission("checklists.complete");
    const parsed = saveAnswersSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: existing, error: existingError } = await supabase
      .from("checklist_answers")
      .select("id, question_id")
      .eq("run_id", parsed.runId);
    if (existingError) return { ok: false, error: existingError.message };

    const existingIdByQuestion = new Map((existing ?? []).map((a) => [a.question_id, a.id]));

    for (const answer of parsed.answers) {
      const row = {
        run_id: parsed.runId,
        question_id: answer.questionId,
        value: answer.value,
        is_na: answer.isNa,
        corrective_action_note: answer.correctiveActionNote || null,
        comment: answer.comment || null,
        photo_url: answer.photoUrl || null,
        answered_by: user?.id ?? null,
        answered_at: new Date().toISOString(),
        // `flagged` is recomputed on completion (evaluateAnswer needs the
        // question + food item together); persisted here too so partial
        // saves already reflect a manual flag toggle.
        flagged: answer.manuallyFlagged,
      };

      const existingId = existingIdByQuestion.get(answer.questionId);
      const { error } = existingId
        ? await supabase.from("checklist_answers").update(row).eq("id", existingId)
        : await supabase.from("checklist_answers").insert(row);

      if (error) return { ok: false, error: error.message };
    }

    revalidateRun(parsed.runId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Completes a run: re-validates every question server-side (defense in depth
 * behind the client-side check in the run-player form), recomputes flags
 * (temp out-of-range / failed yes_no / manual flag), spawns follow_ups for
 * newly flagged answers, marks the run completed, and emits `checklist_
 * complete` (+ `temp_failed` per out-of-range temperature answer). Already-
 * completed runs short-circuit before any of that so a double-submit is a
 * no-op.
 */
export async function completeRun(input: { runId: string }): Promise<ActionResult> {
  try {
    await requirePermission("checklists.complete");
    const { runId } = runIdSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: run, error: runError } = await supabase
      .from("checklist_runs")
      .select("id, status, template_id")
      .eq("id", runId)
      .maybeSingle();
    if (runError) return { ok: false, error: runError.message };
    if (!run) return { ok: false, error: "Checklist run not found." };

    // Idempotency: a run that's already completed is a no-op success, so a
    // double-submit (double click, retried request) cannot double-emit
    // events or double-create follow_ups.
    if (run.status === "completed") {
      return { ok: true, data: undefined };
    }

    const { data: sections, error: sectionsError } = await supabase
      .from("checklist_sections")
      .select("id")
      .eq("template_id", run.template_id);
    if (sectionsError) return { ok: false, error: sectionsError.message };

    const sectionIds = (sections ?? []).map((s) => s.id);
    const { data: questions, error: questionsError } = sectionIds.length
      ? await supabase
          .from("checklist_questions")
          .select("id, type, allow_na, choices, food_item_id, photo_required")
          .in("section_id", sectionIds)
      : { data: [] as QuestionLike[], error: null };
    if (questionsError) return { ok: false, error: questionsError.message };

    const foodItemIds = Array.from(
      new Set((questions ?? []).map((q) => q.food_item_id).filter((id): id is string => Boolean(id))),
    );
    const { data: foodItems, error: foodItemsError } = foodItemIds.length
      ? await supabase
          .from("food_items")
          .select("id, cold_min_f, cold_max_f, hot_min_f, hot_max_f")
          .in("id", foodItemIds)
      : { data: [] as (FoodItemRangeLike & { id: string })[], error: null };
    if (foodItemsError) return { ok: false, error: foodItemsError.message };

    const foodItemsById = new Map((foodItems ?? []).map((f) => [f.id, f]));

    const { data: answers, error: answersError } = await supabase
      .from("checklist_answers")
      .select(
        "id, question_id, value, is_na, corrective_action_note, comment, photo_url, flagged",
      )
      .eq("run_id", runId);
    if (answersError) return { ok: false, error: answersError.message };

    const answersByQuestion = new Map(
      (answers ?? []).map((a) => [
        a.question_id,
        {
          questionId: a.question_id,
          value: a.value as AnswerValue,
          isNa: a.is_na,
          manuallyFlagged: a.flagged,
          correctiveActionNote: a.corrective_action_note,
          comment: a.comment,
        },
      ]),
    );

    const submissionErrors = validateSubmission(
      (questions ?? []) as QuestionLike[],
      answersByQuestion,
      foodItemsById,
    );
    if (submissionErrors.length > 0) {
      return {
        ok: false,
        error: `This checklist isn't ready to complete: ${submissionErrors[0].message} (${submissionErrors.length} question${submissionErrors.length === 1 ? "" : "s"} need attention.)`,
      };
    }

    // Recompute flags fresh from the answered values so a stale `flagged`
    // column value never suppresses a real out-of-range/failed reading.
    const flaggedAnswers = (answers ?? []).map((a) => {
      const question = (questions ?? []).find((q) => q.id === a.question_id);
      if (!question) {
        return { id: a.id, questionId: a.question_id, flagged: a.flagged, isTempFailure: false };
      }
      const evaluated = evaluateAnswer(
        question as QuestionLike,
        question.food_item_id ? foodItemsById.get(question.food_item_id) : undefined,
        { value: a.value as AnswerValue, isNa: a.is_na, manuallyFlagged: a.flagged },
      );
      return {
        id: a.id,
        questionId: a.question_id,
        flagged: evaluated.flagged,
        isTempFailure: question.type === "temperature" && evaluated.requiresCorrectiveAction,
      };
    });

    const flaggedIds = flaggedAnswers.filter((a) => a.flagged).map((a) => a.id);
    // Sync any answer whose recomputed flag differs from what was saved
    // (e.g. a value edited after a manual flag toggle).
    for (const a of flaggedAnswers) {
      const saved = (answers ?? []).find((x) => x.id === a.id);
      if (saved && saved.flagged !== a.flagged) {
        await supabase.from("checklist_answers").update({ flagged: a.flagged }).eq("id", a.id);
      }
    }

    const { data: existingFollowUps, error: followUpsError } = flaggedIds.length
      ? await supabase.from("follow_ups").select("source_answer_id").in("source_answer_id", flaggedIds)
      : { data: [] as { source_answer_id: string | null }[], error: null };
    if (followUpsError) return { ok: false, error: followUpsError.message };

    const existingSourceAnswerIds = new Set(
      (existingFollowUps ?? []).map((f) => f.source_answer_id).filter((id): id is string => Boolean(id)),
    );

    const followUpInserts = planFollowUpInserts(
      flaggedAnswers.map((a) => ({ id: a.id, flagged: a.flagged })),
      existingSourceAnswerIds,
    );

    for (const insert of followUpInserts) {
      const { error } = await supabase.from("follow_ups").insert({
        source_answer_id: insert.source_answer_id,
        description: "Follow up on a flagged checklist answer.",
        status: "open",
      });
      if (error) return { ok: false, error: error.message };
    }

    const { error: completeError } = await supabase
      .from("checklist_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: user?.id ?? null,
      })
      .eq("id", runId)
      .neq("status", "completed");
    if (completeError) return { ok: false, error: completeError.message };

    await emitEventSafely("checklist_complete", {
      runId,
      templateId: run.template_id,
      completedBy: user?.id ?? null,
      flaggedCount: flaggedIds.length,
      followUpsCreated: followUpInserts.length,
    });

    for (const tempFailure of flaggedAnswers.filter((a) => a.isTempFailure)) {
      await emitEventSafely("temp_failed", {
        runId,
        questionId: tempFailure.questionId,
        answerId: tempFailure.id,
      });
    }

    for (const created of followUpInserts) {
      await emitEventSafely("follow_up_assigned", {
        sourceAnswerId: created.source_answer_id,
        runId,
      });
    }

    revalidateRun(runId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Resolves a follow-up. Idempotent: resolving an already-resolved follow-up is a no-op success. */
export async function resolveFollowUp(input: { followUpId: string }): Promise<ActionResult> {
  try {
    await requirePermission("checklists.complete");
    const { followUpId } = followUpIdSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("follow_ups")
      .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: user?.id ?? null })
      .eq("id", followUpId)
      .neq("status", "resolved");

    if (error) return { ok: false, error: error.message };

    revalidatePath("/checklists");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
