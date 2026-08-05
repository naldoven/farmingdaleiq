import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/db/types";
import type { SystemTaskInsert } from "@/app/(app)/tasks/system-tasks";

/**
 * Keeps each day's personal Task list in sync with currently-assigned, still
 * -open maintenance work orders (leader request, 2026-08-05: "whenever you
 * attach a team member ... it should show up in their tasks, in their
 * personal task list").
 *
 * This is deliberately NOT the app_events consumer pattern the rest of
 * app/(app)/tasks/system-tasks.ts uses. That pattern reacts to a single
 * point-in-time event, which fits "a reward was claimed" but not "does this
 * still-open work order have a task for TODAY" -- tasks are date-scoped
 * (`date` column; the Tasks page only ever queries `date = today`), so a
 * work order that stays open for several days needs its task recreated each
 * morning, not created once. That requires reading `work_orders`' CURRENT
 * state directly rather than replaying a historical event, which is why this
 * file is a straight reconciliation query instead of an event-bus consumer.
 * (S2 owns tasks/task_templates and generally reaches other modules' tables
 * only via events -- this is a deliberate, narrow exception for the same
 * reason processTaskEvents' resolveFollowUps reads follow_ups/checklist_
 * answers directly: no event-payload-only path can express "is this still
 * true right now".)
 *
 * Scope: only work orders with a TEAM MEMBER assignee (assigned_user_id).
 * A vendor-assigned or still-unassigned work order has no one's personal
 * task list to land on, so it's excluded entirely -- mirrors how
 * reward_fulfillment tasks intentionally stay unassigned/pool-only for the
 * opposite reason.
 *
 * One-way link (leader decision, 2026-08-05): completing this task never
 * writes back to the work order -- the real status change still happens in
 * Maintenance. To keep the two from silently disagreeing, this reconciler
 * clears (cancels) a maintenance-origin task itself once its work order
 * stops qualifying (completed, or reassigned to someone else) instead of
 * leaving a stale "pending" task sitting in someone's list for work that
 * isn't theirs anymore.
 *
 * "Today" is computed the same way app/(app)/tasks/page.tsx does (server UTC
 * date, not the store's local timezone) for consistency with every other
 * task's `date` -- a maintenance task using a different calendar boundary
 * than its neighbors would be a worse inconsistency than the existing
 * UTC-vs-store-timezone gap. Fixing that gap app-wide is out of scope here.
 */

const ACTIVE_WORK_ORDER_STATUSES = ["open", "in_progress", "on_hold"] as const;

export interface ActiveWorkOrderRow {
  id: string;
  title: string;
  assigned_user_id: string;
}

export interface ExistingMaintenanceTaskRow {
  id: string;
  status: string;
  assigned_user_id: string | null;
  work_order_id: string;
}

export interface MaintenanceSyncPlan {
  toInsert: SystemTaskInsert[];
  toCancelIds: string[];
}

function workOrderIdFromRef(ref: unknown): string | null {
  const value = (ref as Record<string, unknown> | null)?.work_order_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function maintenanceTaskInsert(wo: ActiveWorkOrderRow, date: string): SystemTaskInsert {
  return {
    kind: "maintenance",
    title: wo.title,
    description: null,
    date,
    assigned_user_id: wo.assigned_user_id,
    status: "pending",
    token_value: 0,
    ref: { source: "work_order_status", work_order_id: wo.id } as Json,
  };
}

/**
 * Pure planning step: given the currently-active, team-member-assigned work
 * orders and today's existing maintenance-kind tasks, decides which task
 * rows to create and which to cancel. No I/O, so it's unit-testable without
 * a database (see maintenance-sync.test.ts).
 */
export function planMaintenanceTaskSync(
  activeWorkOrders: ActiveWorkOrderRow[],
  existingTasksToday: ExistingMaintenanceTaskRow[],
  today: string,
): MaintenanceSyncPlan {
  const activeById = new Map(activeWorkOrders.map((wo) => [wo.id, wo]));

  // Keyed by work_order_id -> its live (pending) task today, if any. Only
  // "pending" rows count as live here -- a work order can be reassigned back
  // and forth within the same day (A -> B cancels A's task -> A again), and
  // if the only existing row left for it is a cancelled leftover, that must
  // NOT block creating a fresh pending task for whoever holds it now.
  const pendingByWorkOrderId = new Map<string, ExistingMaintenanceTaskRow>();
  for (const t of existingTasksToday) {
    if (t.status === "pending") pendingByWorkOrderId.set(t.work_order_id, t);
  }

  const toInsert: SystemTaskInsert[] = [];
  const toCancelIds: string[] = [];

  for (const wo of activeWorkOrders) {
    const pending = pendingByWorkOrderId.get(wo.id);

    if (!pending) {
      // No live task today for this still-active, assigned work order --
      // either it's newly assigned, or this is the first sync tick of a new
      // day for a work order that's been open for a while.
      toInsert.push(maintenanceTaskInsert(wo, today));
      continue;
    }

    if (pending.assigned_user_id !== wo.assigned_user_id) {
      // Reassigned since today's task was created: the old assignee's task
      // is no longer theirs to do, and the new assignee needs their own.
      toCancelIds.push(pending.id);
      toInsert.push(maintenanceTaskInsert(wo, today));
    }
    // Otherwise a live pending task already exists for the right person --
    // nothing to do.
  }

  // A maintenance task that's still pending today but whose work order no
  // longer qualifies (completed, or reassigned away -- handled above) would
  // otherwise sit in someone's list looking like open work that isn't
  // theirs anymore.
  for (const existing of existingTasksToday) {
    if (existing.status !== "pending") continue;
    if (activeById.has(existing.work_order_id)) continue;
    toCancelIds.push(existing.id);
  }

  return { toInsert, toCancelIds: [...new Set(toCancelIds)] };
}

/**
 * Runs the reconciliation against the database. Safe to call as often as
 * the sync route likes (see app/api/tasks/events/route.ts) -- every step is
 * a plain idempotent insert/update, so re-running mid-day is harmless.
 */
export async function syncMaintenanceTasks(
  supabase: SupabaseClient<Database>,
  today: string = new Date().toISOString().slice(0, 10),
): Promise<{ created: number; cancelled: number }> {
  const [{ data: workOrders, error: woError }, { data: existingTasks, error: tasksError }] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, title, assigned_user_id")
      .not("assigned_user_id", "is", null)
      .in("status", ACTIVE_WORK_ORDER_STATUSES),
    supabase.from("tasks").select("id, status, assigned_user_id, ref").eq("kind", "maintenance").eq("date", today),
  ]);

  if (woError) {
    throw new Error(`syncMaintenanceTasks: could not load work orders: ${woError.message}`);
  }
  if (tasksError) {
    throw new Error(`syncMaintenanceTasks: could not load today's tasks: ${tasksError.message}`);
  }

  const activeWorkOrders: ActiveWorkOrderRow[] = (workOrders ?? [])
    .filter((wo): wo is typeof wo & { assigned_user_id: string } => Boolean(wo.assigned_user_id))
    .map((wo) => ({ id: wo.id, title: wo.title, assigned_user_id: wo.assigned_user_id }));

  const existingTasksToday: ExistingMaintenanceTaskRow[] = (existingTasks ?? [])
    .map((t) => ({
      id: t.id,
      status: t.status,
      assigned_user_id: t.assigned_user_id,
      work_order_id: workOrderIdFromRef(t.ref),
    }))
    .filter((t): t is ExistingMaintenanceTaskRow => Boolean(t.work_order_id));

  const plan = planMaintenanceTaskSync(activeWorkOrders, existingTasksToday, today);

  if (plan.toInsert.length > 0) {
    const { error } = await supabase.from("tasks").insert(plan.toInsert);
    if (error) {
      throw new Error(`syncMaintenanceTasks: could not create tasks: ${error.message}`);
    }
  }

  if (plan.toCancelIds.length > 0) {
    const { error } = await supabase.from("tasks").update({ status: "cancelled" }).in("id", plan.toCancelIds);
    if (error) {
      throw new Error(`syncMaintenanceTasks: could not cancel stale tasks: ${error.message}`);
    }
  }

  return { created: plan.toInsert.length, cancelled: plan.toCancelIds.length };
}
