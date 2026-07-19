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
import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/checklists/action-types";
import {
  buildChecklistCompletePayload,
  buildFollowUpDescription,
  buildFollowUpEventPayload,
  buildFollowUpTitle,
  evaluateAnswer,
  followUpDueAt,
  isBeforeStartTime,
  planFollowUpInserts,
  storeLocalNow,
  sumAnsweredTokenValue,
  validateSubmission,
  type AnswerValue,
  type FoodItemRangeLike,
  type QuestionLike,
} from "@/app/(app)/checklists/logic";
import {
  assignRunSchema,
  followUpIdSchema,
  runIdSchema,
  saveAnswersSchema,
  type AssignRunInput,
  type SaveAnswersInput,
} from "@/app/(app)/checklists/validation";

function revalidateRun(runId: string) {
  revalidatePath("/checklists");
  revalidatePath(`/checklists/${runId}`);
}

/**
 * Best-effort event emission: the checklist_runs/checklist_answers/follow_ups
 * mutations above are the source of truth for "did this run complete"; event
 * emission is notification-side plumbing consumed by other streams (S7
 * tokens, S10 notifications/Discord). It must never turn a successful
 * completion into a reported failure. `app_events` now has an RLS policy
 * covering these event keys, but emitEvent can still fail for transient
 * reasons (network, a future policy change), so every emit stays best-effort.
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

    // FIQ-10: one upsert on (run_id, question_id) instead of a read-then-
    // insert/update loop, so two overlapping saves (autosave racing an
    // explicit save, or two tabs) can't create duplicate answer rows that
    // would double-count flagged/temp-failed answers on completion.
    const rows = parsed.answers.map((answer) => ({
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
      // question + food item together); persisted here too so partial saves
      // already reflect a manual flag toggle.
      flagged: answer.manuallyFlagged,
    }));

    if (rows.length > 0) {
      const { error } = await supabase
        .from("checklist_answers")
        .upsert(rows, { onConflict: "run_id,question_id" });
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
      .select("id, status, template_id, schedule_id, assigned_user_id")
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

    // Enforce the schedule's start_time (ARCHITECTURE.md "a start_time that
    // blocks early completion"): a run scheduled to open later in the day
    // can't be completed before then. Compared in the STORE's timezone so the
    // window matches how the schedule was authored, not the UTC server clock.
    if (run.schedule_id) {
      const [{ data: schedule }, { data: store }] = await Promise.all([
        supabase.from("checklist_schedules").select("start_time").eq("id", run.schedule_id).maybeSingle(),
        supabase.from("stores").select("timezone").limit(1).maybeSingle(),
      ]);
      const timeZone = store?.timezone || "America/New_York";
      const { timeOfDay } = storeLocalNow(new Date(), timeZone);
      if (isBeforeStartTime(schedule?.start_time, timeOfDay)) {
        return {
          ok: false,
          error: "This checklist can't be completed before its scheduled start time.",
        };
      }
    }

    const [{ data: sections, error: sectionsError }, { data: template }] = await Promise.all([
      supabase.from("checklist_sections").select("id").eq("template_id", run.template_id),
      supabase.from("checklist_templates").select("name").eq("id", run.template_id).maybeSingle(),
    ]);
    if (sectionsError) return { ok: false, error: sectionsError.message };
    const templateName = template?.name ?? null;

    const sectionIds = (sections ?? []).map((s) => s.id);
    const { data: questions, error: questionsError } = sectionIds.length
      ? await supabase
          .from("checklist_questions")
          .select("id, type, allow_na, choices, food_item_id, photo_required, prompt, token_value")
          .in("section_id", sectionIds)
      : { data: [] as (QuestionLike & { prompt: string; token_value: number })[], error: null };
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
          // C2 fix: carry the saved photo_url through to validateSubmission.
          // saveAnswers persists photo_url, but omitting it here made
          // validateSubmission see photoUrl=undefined for every answer, so any
          // `photo_required` question could NEVER be completed (the photo it
          // required was always treated as missing).
          photoUrl: a.photo_url,
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

    // Idempotency gate under concurrency: atomically transition the run to
    // completed BEFORE creating follow_ups or emitting events. The
    // `.neq(status, completed)` filter means only one of two concurrent
    // completeRun calls (fast double-click, retried request, two tabs) can
    // flip the row; `.select("id")` reports which call actually won. The loser
    // returns as an idempotent no-op, so follow_ups are created once and the
    // checklist_complete / temp_failed / follow_up_assigned events (consumed
    // by S7 tokens + S10 notifications) fire exactly once. The top-of-function
    // status check already covers the sequential re-submit case; this covers
    // the concurrent one, where both callers read in_progress before either
    // commits.
    const { data: claimed, error: completeError } = await supabase
      .from("checklist_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: user?.id ?? null,
      })
      .eq("id", runId)
      .neq("status", "completed")
      .select("id");
    if (completeError) return { ok: false, error: completeError.message };
    if (!claimed || claimed.length === 0) {
      // A concurrent call already completed this run; do not double-create
      // follow_ups or double-emit events.
      revalidateRun(runId);
      return { ok: true, data: undefined };
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

    // Follow-ups inherit an assignee (the run's owner, else the completer),
    // a due date, and a specific description tied back to the source question
    // and template, so they carry real context instead of a generic line.
    const now = new Date();
    const assigneeId = run.assigned_user_id ?? user?.id ?? null;
    const promptByQuestionId = new Map(
      (questions ?? []).map((q) => [q.id, (q as { prompt?: string }).prompt ?? null]),
    );
    const questionIdByAnswerId = new Map((answers ?? []).map((a) => [a.id, a.question_id]));

    const createdFollowUps: {
      followUpId: string | null;
      sourceAnswerId: string;
      title: string;
      description: string;
    }[] = [];
    for (const insert of followUpInserts) {
      const questionId = questionIdByAnswerId.get(insert.source_answer_id) ?? null;
      const prompt = questionId ? promptByQuestionId.get(questionId) ?? null : null;
      const title = buildFollowUpTitle(prompt);
      const description = buildFollowUpDescription(prompt, templateName);
      const { data: insertedFollowUp, error } = await supabase
        .from("follow_ups")
        .insert({
          source_answer_id: insert.source_answer_id,
          description,
          assigned_to: assigneeId,
          due_at: followUpDueAt(now),
          status: "open",
        })
        .select("id")
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      createdFollowUps.push({
        followUpId: insertedFollowUp?.id ?? null,
        sourceAnswerId: insert.source_answer_id,
        title,
        description,
      });
    }

    const tokenValueSum = sumAnsweredTokenValue(
      (questions ?? []).map((q) => ({
        id: q.id,
        token_value: (q as { token_value?: number }).token_value ?? 0,
      })),
      (answers ?? []).map((a) => ({ question_id: a.question_id, is_na: a.is_na })),
    );

    await emitEventSafely(
      "checklist_complete",
      buildChecklistCompletePayload({
        runId,
        templateId: run.template_id,
        completedBy: user?.id ?? null,
        tokenValue: tokenValueSum,
        flaggedCount: flaggedIds.length,
        followUpsCreated: createdFollowUps.length,
      }),
    );

    for (const tempFailure of flaggedAnswers.filter((a) => a.isTempFailure)) {
      await emitEventSafely("temp_failed", {
        runId,
        questionId: tempFailure.questionId,
        answerId: tempFailure.id,
      });
    }

    for (const created of createdFollowUps) {
      await emitEventSafely(
        "follow_up_assigned",
        buildFollowUpEventPayload({
          followUpId: created.followUpId,
          sourceAnswerId: created.sourceAnswerId,
          runId,
          title: created.title,
          description: created.description,
          assigneeId,
        }),
      );
    }

    revalidateRun(runId);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Delegates (or un-delegates) a run to a person mid-shift. Leader-gated on
 * `checklists.manage_templates` (the checklist-manager tier; RLS on
 * checklist_runs already permits that key to update). Passing `userId: null`
 * returns the run to the unassigned pool. Completed/missed runs can't be
 * reassigned.
 */
export async function assignRun(input: AssignRunInput): Promise<ActionResult> {
  try {
    await requirePermission("checklists.manage_templates");
    const parsed = assignRunSchema.parse(input);
    const supabase = await createClient();

    const { data: run, error: runError } = await supabase
      .from("checklist_runs")
      .select("id, status")
      .eq("id", parsed.runId)
      .maybeSingle();
    if (runError) return { ok: false, error: runError.message };
    if (!run) return { ok: false, error: "Checklist run not found." };
    if (run.status === "completed" || run.status === "missed") {
      return { ok: false, error: "This run can no longer be reassigned." };
    }

    const { error } = await supabase
      .from("checklist_runs")
      .update({ assigned_user_id: parsed.userId })
      .eq("id", parsed.runId);
    if (error) return { ok: false, error: error.message };

    revalidateRun(parsed.runId);
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
