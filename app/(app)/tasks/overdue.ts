import type { SupabaseClient } from "@supabase/supabase-js";

import { emitEvent } from "@/lib/events/bus";
import { buildTaskOverdueEvent } from "@/app/(app)/tasks/events";
import type { Database } from "@/lib/db/types";

/**
 * Due handling (PLAN.md S2 brief: "due handling"; `task_overdue` is in the
 * frozen event enum, lib/events/bus.ts). Transitions any `pending` task past
 * its `due_at` to `overdue` and emits `task_overdue` once per task.
 *
 * Idempotent by construction: the UPDATE only matches rows still `pending`,
 * so once a task flips to `overdue` this will never select it again and
 * `task_overdue` is never emitted twice for the same task — no extra
 * "already notified" bookkeeping needed.
 */
export async function markOverdueTasks(
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<{ marked: number }> {
  const { data: overdue, error } = await supabase
    .from("tasks")
    .update({ status: "overdue" })
    .eq("status", "pending")
    .not("due_at", "is", null)
    .lt("due_at", now.toISOString())
    .select("id, title, assigned_user_id, assigned_position_id");

  if (error) {
    throw new Error(`markOverdueTasks: update failed: ${error.message}`);
  }

  for (const task of overdue ?? []) {
    try {
      await emitEvent(
        "task_overdue",
        buildTaskOverdueEvent({
          taskId: task.id,
          title: task.title,
          assignedUserId: task.assigned_user_id,
          assignedPositionId: task.assigned_position_id,
        }),
      );
    } catch {
      // Best-effort notification hook; see system-tasks.ts's header comment
      // for why emitEvent can fail in an unauthenticated scheduled context.
    }
  }

  return { marked: (overdue ?? []).length };
}
