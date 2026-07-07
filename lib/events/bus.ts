import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/db/types";

/**
 * Every event key the app can emit. This is the merge-safety contract
 * between modules (PLAN.md "Risks": event bus changes require orchestrator
 * sign-off). Includes every key referenced by ARCHITECTURE.md
 * `discord_event_routes`, the notifications list, and the P1 module briefs.
 *
 * Consumers (token earning rules, the notification fan-out, and the Discord
 * outbox worker) subscribe by event key; they are implemented by the streams
 * that own them (S7, S10) and are out of scope for P0.
 */
export const EVENT_KEYS = [
  // Tasks
  "task_assigned",
  "task_complete",
  "task_overdue",

  // Checklists
  "checklist_complete",
  "checklist_missed",
  "temp_failed",

  // Setups & shifts
  "setup_posted",
  "break_overdue",
  "top_performer",

  // Accountability
  "infraction_issued",
  "disciplinary_triggered",

  // Tokens, rewards, feed
  "recognition",
  "gift_sent",
  "reward_claim",
  "reward_fulfilled",
  "broadcast",

  // Training / passports / trainee lifecycle
  "training_assigned",
  "follow_up_assigned",
  "passport_stamped",
  "graduation_ready",

  // Maintenance
  "maint_request",
  "work_order_status",
  "equipment_down",
  "equipment_up",
  "pm_due",

  // Catering
  "catering_order_new",
  "catering_stage_change",
] as const;

export type EventKey = (typeof EVENT_KEYS)[number];

export type EventPayload = Record<string, unknown>;

/**
 * Writes one row to `app_events`. This is the entire producer-side contract:
 * any module can call this without importing the modules that consume the
 * event. Consumers read `app_events` (poll or Realtime-subscribe) and act by
 * event key.
 */
export async function emitEvent(key: EventKey, payload: EventPayload): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from("app_events").insert({
    event_key: key,
    // EventPayload is intentionally Record<string, unknown> for producer
    // ergonomics; the app_events.payload column is jsonb, so anything an
    // emitter passes must already be JSON-serializable at this boundary.
    payload: payload as Json,
  });

  if (error) {
    throw new Error(`emitEvent(${key}) failed: ${error.message}`);
  }
}
