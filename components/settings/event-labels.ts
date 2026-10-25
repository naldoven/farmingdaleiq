/**
 * Admin-facing names for the event keys the Discord settings screen lists.
 * A plain module (no "use client") so both the client route table and the
 * server-rendered silent-events checklist can read the same names; importing
 * a constant out of a client module from a server component would hand the
 * server a client reference instead of the object.
 */
export const EVENT_LABELS: Record<string, string> = {
  task_overdue: "Task overdue",
  checklist_missed: "Checklist missed",
  break_overdue: "Break overdue",
  temp_failed: "Out-of-range temperature",
  maint_request: "New maintenance request",
  work_order_status: "Work order status change",
  equipment_down: "Equipment down",
  equipment_up: "Equipment back up",
  pm_due: "PM coming due",
  recognition: "Recognition",
  top_performer: "Top Performer",
  broadcast: "Broadcast",
  reward_claim: "Reward claim",
  catering_order_new: "New catering order",
  catering_stage_change: "Catering stage change",
  catering_tomorrow_digest: "Tomorrow's catering digest (6 PM)",
  infraction_issued: "Infraction issued (name only, no points)",
  disciplinary_triggered: "Disciplinary action (name only, no points)",
};
