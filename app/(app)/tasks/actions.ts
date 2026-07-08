"use server";

/**
 * Tasks server actions. Follows the People/Teams permission-guard pattern
 * documented in app/(app)/people/actions.ts:
 *   1. requirePermission(<key>) first — throws before any DB call if the
 *      signed-in user's role lacks the key.
 *   2. Writes go through the per-request Supabase client (RLS on
 *      tasks/task_templates is the independent backstop for the same rule and
 *      is now in place — see the app_events + RLS backfill migration).
 *   3. Actions return a discriminated ActionResult instead of throwing.
 *   4. Mutations call revalidatePath("/tasks").
 *
 * Idempotency (PLAN.md hard boundary: "any action that can be double-
 * submitted ... must be safe to run twice"): completeTask and claimTask each
 * do a conditional UPDATE (`.neq("status", "completed")` / `.is
 * ("assigned_user_id", null)`) so a double-submit either no-ops or reports
 * "already done" instead of double-completing or double-claiming. Money
 * note: completeTask never touches a token balance directly — it only emits
 * `task_complete` with `token_value`; S7's ledger owns the actual award, and
 * the completion guard above is what stops that event from firing twice for
 * one real completion.
 */

import { revalidatePath } from "next/cache";

import { PermissionError, hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events/bus";
import {
  buildTaskAssignedEvent,
  buildTaskCompleteEvent,
} from "@/app/(app)/tasks/events";
import type { ActionResult } from "@/app/(app)/tasks/action-types";
import {
  claimTaskSchema,
  cancelTaskSchema,
  completeTaskSchema,
  createTaskSchema,
  createTaskTemplateSchema,
  delegateTaskSchema,
  setTaskTemplateActiveSchema,
  updateTaskTemplateSchema,
  type CancelTaskInput,
  type ClaimTaskInput,
  type CompleteTaskInput,
  type CreateTaskInput,
  type CreateTaskTemplateInput,
  type DelegateTaskInput,
  type SetTaskTemplateActiveInput,
  type UpdateTaskTemplateInput,
} from "@/app/(app)/tasks/validation";

function toActionError(error: unknown): string {
  if (error instanceof PermissionError) {
    return "You don't have permission to do this.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

/** Best-effort event emission: never let a notification hook fail a write
 * the user is waiting on. emitEvent writes app_events through the frozen bus
 * (lib/events/bus.ts) on the cookie-bound client, so a transient write failure
 * must not roll back the user's action. */
async function emitBestEffort(key: Parameters<typeof emitEvent>[0], payload: Record<string, unknown>) {
  try {
    await emitEvent(key, payload);
  } catch {
    // Swallowed intentionally; see doc comment above.
  }
}

/** Ad hoc (one-off) task: create for a person, a position, or the pool. */
export async function createTask(
  input: CreateTaskInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("tasks.manage");
    const parsed = createTaskSchema.parse(input);
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        kind: "adhoc",
        title: parsed.title,
        description: parsed.description,
        date: parsed.date,
        day_part_id: parsed.dayPartId,
        start_time: parsed.startTime,
        due_at: parsed.dueAt,
        assigned_user_id: parsed.assignedUserId,
        assigned_position_id: parsed.assignedUserId ? null : parsed.assignedPositionId,
        token_value: parsed.tokenValue,
        notify_discord: parsed.notifyDiscord,
        discord_channel_id: parsed.discordChannelId,
        created_by: userData.user?.id ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create task." };
    }

    revalidatePath("/tasks");

    if (parsed.assignedUserId || parsed.assignedPositionId) {
      await emitBestEffort(
        "task_assigned",
        buildTaskAssignedEvent({
          taskId: data.id,
          assignedUserId: parsed.assignedUserId,
          assignedPositionId: parsed.assignedPositionId,
          actorId: userData.user?.id ?? null,
          notifyDiscord: parsed.notifyDiscord,
          discordChannelId: parsed.discordChannelId,
        }),
      );
    }

    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Recurring task definition; materialized nightly by app/api/tasks/sync. */
export async function createTaskTemplate(
  input: CreateTaskTemplateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("tasks.manage");
    const parsed = createTaskTemplateSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("task_templates")
      .insert({
        title: parsed.title,
        description: parsed.description,
        frequency: parsed.frequency,
        days_of_week: parsed.daysOfWeek,
        day_part_id: parsed.dayPartId,
        start_time: parsed.startTime,
        due_time: parsed.dueTime,
        assign_position_id: parsed.assignPositionId,
        assign_user_id: parsed.assignUserId,
        token_value: parsed.tokenValue,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create template." };
    }

    revalidatePath("/tasks");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Edits an existing recurring template in place. Only changes the definition;
 * already-materialized task rows are untouched (future materializations pick up
 * the new values). tasks.manage-gated. */
export async function updateTaskTemplate(
  input: UpdateTaskTemplateInput,
): Promise<ActionResult> {
  try {
    await requirePermission("tasks.manage");
    const parsed = updateTaskTemplateSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("task_templates")
      .update({
        title: parsed.title,
        description: parsed.description,
        frequency: parsed.frequency,
        days_of_week: parsed.daysOfWeek,
        day_part_id: parsed.dayPartId,
        start_time: parsed.startTime,
        due_time: parsed.dueTime,
        assign_position_id: parsed.assignPositionId,
        assign_user_id: parsed.assignUserId,
        token_value: parsed.tokenValue,
      })
      .eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/tasks");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function setTaskTemplateActive(
  input: SetTaskTemplateActiveInput,
): Promise<ActionResult> {
  try {
    await requirePermission("tasks.manage");
    const parsed = setTaskTemplateActiveSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("task_templates")
      .update({ active: parsed.active })
      .eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/tasks");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Self-assigns an unassigned (pool) task. Idempotent: claiming a task you
 * already hold is a no-op; claiming a task someone else already grabbed
 * fails cleanly instead of stealing it (the `.is("assigned_user_id", null)`
 * guard makes the underlying UPDATE atomic against a concurrent claim).
 */
export async function claimTask(input: ClaimTaskInput): Promise<ActionResult> {
  try {
    await requirePermission("tasks.complete");
    const parsed = claimTaskSchema.parse(input);
    const supabase = await createClient();

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return { ok: false, error: "Not signed in." };
    }
    const userId = userData.user.id;

    const { data: existing, error: fetchError } = await supabase
      .from("tasks")
      .select("id, assigned_user_id")
      .eq("id", parsed.id)
      .maybeSingle();

    if (fetchError) {
      return { ok: false, error: fetchError.message };
    }
    if (!existing) {
      return { ok: false, error: "Task not found." };
    }
    if (existing.assigned_user_id === userId) {
      return { ok: true, data: undefined };
    }

    const { data: updated, error: updateError } = await supabase
      .from("tasks")
      .update({ assigned_user_id: userId })
      .eq("id", parsed.id)
      .is("assigned_user_id", null)
      .select("id")
      .maybeSingle();

    if (updateError) {
      return { ok: false, error: updateError.message };
    }
    if (!updated) {
      return { ok: false, error: "Someone already claimed this task." };
    }

    revalidatePath("/tasks");
    await emitBestEffort(
      "task_assigned",
      buildTaskAssignedEvent({
        taskId: parsed.id,
        assignedUserId: userId,
        actorId: userId,
      }),
    );

    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Leader delegation: assign (or reassign) an existing task to a person or a
 * position. Setting the same assignee twice is naturally a no-op. */
export async function delegateTask(input: DelegateTaskInput): Promise<ActionResult> {
  try {
    await requirePermission("tasks.manage");
    const parsed = delegateTaskSchema.parse(input);
    const supabase = await createClient();

    const { data: userData } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("tasks")
      .update({
        assigned_user_id: parsed.assignedUserId,
        assigned_position_id: parsed.assignedUserId ? null : parsed.assignedPositionId,
      })
      .eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/tasks");
    // A delegation with no assignee is a "return to the pool" — nobody to
    // notify, so skip the assignment event in that case.
    if (parsed.assignedUserId || parsed.assignedPositionId) {
      await emitBestEffort(
        "task_assigned",
        buildTaskAssignedEvent({
          taskId: parsed.id,
          assignedUserId: parsed.assignedUserId,
          assignedPositionId: parsed.assignedPositionId,
          actorId: userData.user?.id ?? null,
        }),
      );
    }

    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Completes a task. Idempotent and race-safe: the UPDATE only applies while
 * status isn't already 'completed' (`.neq("status", "completed")`), so a
 * double-submit (double-tap, retried request) either completes it once or
 * reports `alreadyCompleted: true` on the second call — it never re-emits
 * `task_complete`, which would otherwise double-award tokens downstream.
 */
export async function completeTask(
  input: CompleteTaskInput,
): Promise<ActionResult<{ alreadyCompleted: boolean }>> {
  try {
    await requirePermission("tasks.complete");
    const parsed = completeTaskSchema.parse(input);
    const supabase = await createClient();

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return { ok: false, error: "Not signed in." };
    }
    const userId = userData.user.id;

    const { data: existing, error: fetchError } = await supabase
      .from("tasks")
      .select("id, assigned_user_id, status")
      .eq("id", parsed.id)
      .maybeSingle();

    if (fetchError) {
      return { ok: false, error: fetchError.message };
    }
    if (!existing) {
      return { ok: false, error: "Task not found." };
    }

    const canManage = await hasPermission("tasks.manage");
    if (existing.assigned_user_id && existing.assigned_user_id !== userId && !canManage) {
      return { ok: false, error: "This task isn't assigned to you." };
    }
    if (!existing.assigned_user_id && !canManage) {
      return { ok: false, error: "Claim this task before completing it." };
    }

    if (existing.status === "completed") {
      return { ok: true, data: { alreadyCompleted: true } };
    }

    const { data: updated, error: updateError } = await supabase
      .from("tasks")
      .update({
        status: "completed",
        completed_by: userId,
        completed_at: new Date().toISOString(),
      })
      .eq("id", parsed.id)
      .neq("status", "completed")
      .select("id, kind, token_value")
      .maybeSingle();

    if (updateError) {
      return { ok: false, error: updateError.message };
    }
    if (!updated) {
      // Completed by a concurrent request between our read and this write.
      return { ok: true, data: { alreadyCompleted: true } };
    }

    revalidatePath("/tasks");
    await emitBestEffort(
      "task_complete",
      buildTaskCompleteEvent({
        taskId: updated.id,
        kind: updated.kind,
        tokenValue: updated.token_value,
        userId,
      }),
    );

    return { ok: true, data: { alreadyCompleted: false } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Leader cancels a task that's no longer needed. No-ops on an already
 * completed task rather than un-completing it. */
export async function cancelTask(input: CancelTaskInput): Promise<ActionResult> {
  try {
    await requirePermission("tasks.manage");
    const parsed = cancelTaskSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("tasks")
      .update({ status: "cancelled" })
      .eq("id", parsed.id)
      .neq("status", "completed");

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/tasks");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
