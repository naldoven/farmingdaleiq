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
 * ---------------------------------------------------------------------------
 * Canonical event-payload contract
 * ---------------------------------------------------------------------------
 * The parity audit's single largest theme was a systemic field-name mismatch:
 * producers emitted recipient/amount fields under names the consumers never
 * read (`completedBy`/`completed_by`/`assigned_user_id`/`to_user_id` vs the
 * `user_id` the tokens and notification consumers read), so every side's unit
 * tests stayed green against a fabricated shape while the real integration was
 * dead. These types are the one authoritative shape every emitter and every
 * consumer conforms to. They intentionally do NOT change `emitEvent`'s
 * signature (it stays `EventPayload = Record<string, unknown>` for producer
 * ergonomics and to avoid a breaking ripple across modules); they are the
 * documented contract a producer builds its payload against and a consumer
 * reads by.
 */

/**
 * Who a notification/token event is FOR. A producer sets exactly one of these
 * — `user_id` for a single recipient, `user_ids` for many. The notify
 * recipient extractor (lib/notify/recipients.ts) reads BOTH. The person who
 * caused the event is recorded separately as `actor_id` (below) and is NEVER
 * treated as a recipient — recording the actor must never accidentally
 * notify or credit them.
 */
export interface RecipientFields {
  user_id?: string;
  user_ids?: string[];
}

/** Who performed the action, recorded separately from the recipient. */
export interface ActorFields {
  actor_id?: string;
}

/**
 * Per-item token amount override. When an event carries its own amount, it
 * goes here. `checklist_complete` sums its answered questions' `token_value`
 * into this field; the token earning consumer (app/(app)/tokens/logic.ts)
 * reads `token_value`, falling back to `token_earning_rules` when absent.
 */
export interface TokenAmountFields {
  token_value?: number;
}

/**
 * Per-instance Discord controls (ARCHITECTURE.md "Discord integration" >
 * "The flag"). A producer whose row has `notify_discord` OFF must emit
 * `notify_discord: false` to suppress the post for that one instance;
 * `discord_channel_id`, when present, overrides the global
 * `discord_event_routes` channel for this one event. The notify consumer
 * (lib/notify/events.ts) honors both.
 */
export interface DiscordControlFields {
  notify_discord?: boolean;
  discord_channel_id?: string;
}

/** Reward-claim event (`reward_claim`): the claimant is the recipient. */
export type RewardClaimPayload = DiscordControlFields & {
  claim_id: string;
  reward_name: string;
  /** claimant */
  user_id: string;
};

/**
 * Follow-up event (`follow_up_assigned`) raised from a flagged checklist
 * answer. `user_id` is the assignee and is nullable (an unassigned follow-up
 * sits in the pool for a leader to delegate).
 */
export type FollowUpPayload = ActorFields &
  DiscordControlFields & {
    follow_up_id: string;
    source_answer_id: string;
    run_id: string;
    title: string;
    description: string;
    /** assignee, nullable */
    user_id: string | null;
  };

/**
 * The common canonical shape. Any producer may build on this; consumers read
 * from it. Extends the open `EventPayload` so a producer can still attach
 * event-specific fields (e.g. `title`, `message`) without a cast.
 */
export type CanonicalEventPayload = RecipientFields &
  ActorFields &
  TokenAmountFields &
  DiscordControlFields &
  EventPayload;

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
