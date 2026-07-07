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
