/**
 * Pure business logic for Maintenance (ARCHITECTURE.md "Maintenance (modeled
 * on UpKeep)"). Kept free of Supabase/Next imports so it is unit-testable
 * without a DB and safely importable from server actions, pages, and the
 * cron route handler.
 */

export const WORK_ORDER_STATUSES = [
  "open",
  "in_progress",
  "on_hold",
  "complete",
  "cancelled",
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const MAINTENANCE_REQUEST_STATUSES = ["pending", "approved", "declined"] as const;
export type MaintenanceRequestStatus = (typeof MAINTENANCE_REQUEST_STATUSES)[number];

export const WORK_ORDER_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];

export const EQUIPMENT_STATUSES = ["operational", "down"] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

/**
 * Allowed forward transitions for a work order (ARCHITECTURE.md "Work
 * orders": "statuses open -> in progress -> on hold -> complete (or
 * cancelled)"). `complete` and `cancelled` are terminal: no transition out.
 * A transition to the CURRENT status is handled by the caller as a no-op
 * (idempotent double-submit), not as a "valid transition" here, so it never
 * needs to appear in this matrix.
 */
const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  open: ["in_progress", "on_hold", "cancelled"],
  in_progress: ["on_hold", "complete", "cancelled"],
  on_hold: ["in_progress", "cancelled"],
  complete: [],
  cancelled: [],
};

/**
 * Whether `next` is a legal forward move from `current`. Callers must check
 * `current === next` separately and treat that as an idempotent no-op
 * (safe to "complete" an already-complete work order twice, for example).
 */
export function isValidWorkOrderTransition(
  current: WorkOrderStatus,
  next: WorkOrderStatus,
): boolean {
  return WORK_ORDER_TRANSITIONS[current]?.includes(next) ?? false;
}

/**
 * UI-facing transition list per status, EXCLUDING "complete": the status
 * board only ever offers "complete" through the dedicated complete-with-
 * cost flow (completeWorkOrder in app/(app)/maintenance/actions.ts), never
 * as a plain status button, so cost/invoice are always captured together
 * with the status flip.
 */
export const WORK_ORDER_TRANSITIONS_FOR_UI: Record<WorkOrderStatus, WorkOrderStatus[]> = Object.fromEntries(
  Object.entries(WORK_ORDER_TRANSITIONS).map(([status, next]) => [
    status,
    next.filter((s) => s !== "complete"),
  ]),
) as Record<WorkOrderStatus, WorkOrderStatus[]>;

/**
 * Adds `days` to an ISO date string (YYYY-MM-DD), returning an ISO date
 * string. Uses UTC noon internally to sidestep DST edge cases shifting the
 * calendar date under local-time arithmetic.
 */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export interface PmScheduleLike {
  id: string;
  equipment_id: string;
  title: string;
  description: string | null;
  interval_days: number;
  lead_days: number;
  next_due_on: string | null;
  checklist_template_id: string | null;
  assign_user_id: string | null;
  vendor_id: string | null;
  priority: string | null;
  active: boolean;
}

/**
 * Whether a PM schedule is due to generate its work order as of `asOfDate`
 * (ISO date string): ARCHITECTURE.md "Preventive maintenance": "auto-generate
 * a work order N days before due" where N = lead_days. Inactive schedules or
 * schedules with no next_due_on set never generate.
 */
export function isPmScheduleDue(schedule: PmScheduleLike, asOfDate: string): boolean {
  if (!schedule.active || !schedule.next_due_on) return false;
  const leadCutoff = addDays(schedule.next_due_on, -schedule.lead_days);
  return asOfDate >= leadCutoff;
}

/**
 * Plans which PM schedules should generate a new work order today.
 * Idempotency: a schedule already represented by an open (non-terminal) work
 * order is skipped, so calling this on every cron tick never double-generates
 * for the same due date (`openWorkOrderScheduleIds` = pm_schedule_id of every
 * work order whose status is not complete/cancelled).
 */
export function planPmGeneration(
  schedules: PmScheduleLike[],
  openWorkOrderScheduleIds: Set<string>,
  asOfDate: string,
): PmScheduleLike[] {
  return schedules.filter(
    (schedule) => isPmScheduleDue(schedule, asOfDate) && !openWorkOrderScheduleIds.has(schedule.id),
  );
}

/** Priority validated/defaulted from a schedule's free-text priority column. */
export function resolvePmPriority(priority: string | null): WorkOrderPriority {
  return (WORK_ORDER_PRIORITIES as readonly string[]).includes(priority ?? "")
    ? (priority as WorkOrderPriority)
    : "medium";
}

/**
 * The `app_events.payload` recipient fragment for the person who submitted a
 * maintenance request (ARCHITECTURE.md "Requests": "any team member submits
 * ... and is notified as its status changes"). Uses the canonical recipient
 * key (`user_id`, string) that `lib/notify/recipients.ts`'s
 * `extractRecipientIds` reads — see this function's contract test in
 * logic.test.ts, which runs the real extractor against this real shape.
 * Returns an empty object (no key) rather than `{ user_id: null }` when
 * there's no requester to notify, since a payload with `user_id` present but
 * not a non-empty string would still be silently ignored by the extractor
 * anyway; omitting the key is the more honest shape.
 */
export function requesterRecipientPayload(submittedBy: string | null): { user_id?: string } {
  return submittedBy ? { user_id: submittedBy } : {};
}

export interface ChecklistRunInsert {
  template_id: string;
  run_date: string;
  assigned_user_id: string | null;
}

/**
 * The checklist_runs row to materialize for a PM schedule's "optional
 * checklist procedure" (ARCHITECTURE.md "Preventive maintenance": "optionally
 * attaching a checklist template"), or null when the schedule has none
 * configured. The run inherits the PM schedule's assignee (if any) so it
 * shows up assigned the same way a checklist-module-native run would.
 */
export function pmChecklistRunInsert(
  schedule: PmScheduleLike,
  asOfDate: string,
): ChecklistRunInsert | null {
  if (!schedule.checklist_template_id) return null;
  return {
    template_id: schedule.checklist_template_id,
    run_date: asOfDate,
    assigned_user_id: schedule.assign_user_id,
  };
}

export interface WorkOrderDiscordFlags {
  notify_discord: boolean;
  discord_channel_id: string | null;
}

/**
 * Forwards a work order's per-instance Discord opt-in (ARCHITECTURE.md
 * "Discord integration" > "The flag": "Leaders toggle it on for the
 * important stuff") into an emitEvent payload, using the keys
 * lib/notify/events.ts already reads (`notifyDiscord`, and a channel id for
 * whenever that consumer starts preferring a payload channel over the
 * global route).
 *
 * Deliberately one-directional: only forwards the `true` case. The column
 * defaults `notify_discord` to `false` for every existing/new row (see
 * supabase/migrations/20260707001400_maintenance.sql), and the shared
 * consumer (lib/notify/events.ts, owned by the Notifications stream, not
 * this one) currently treats a payload's `notifyDiscord: false` as a
 * per-instance SUPPRESS override ahead of the global discord_event_routes
 * table. Forwarding the column's default `false` verbatim would therefore
 * silently mute every maintenance Discord post the moment this ships,
 * which contradicts "toggle it on" (opt-in, not opt-out). Once the
 * Notifications stream's consumer distinguishes "explicitly opted in" from
 * "never set" (and reads the channel id), this can forward both directions.
 */
export function discordFlagPayload(
  row: WorkOrderDiscordFlags,
): { notifyDiscord: true; discordChannelId: string } | { notifyDiscord: true } | Record<string, never> {
  if (!row.notify_discord) return {};
  return row.discord_channel_id
    ? { notifyDiscord: true, discordChannelId: row.discord_channel_id }
    : { notifyDiscord: true };
}
