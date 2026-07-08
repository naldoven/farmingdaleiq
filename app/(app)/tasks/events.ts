import type { EventPayload } from "@/lib/events/bus";

/**
 * Canonical Tasks event-payload builders.
 *
 * These exist so the Tasks producers and the cross-module consumers can never
 * drift apart on field names again (the parity audit's headline bug: every
 * emitter and every consumer tested its own fabricated shape, so all sides
 * stayed green while the integration was dead). The contract test
 * (events.test.ts) feeds the OUTPUT of these builders through the REAL
 * consumers (lib/notify recipient extractor, tokens earning resolver), so a
 * rename here that breaks a consumer fails a test instead of shipping silently.
 *
 * Canonical field-name contract (shared across every module):
 *   - `user_id`   — the single recipient (a person to notify / credit).
 *   - `actor_id`  — who performed the action, recorded separately from the
 *                   recipient (never used as the recipient key).
 *   - `token_value` — a per-item token amount the earning consumer prefers over
 *                   its flat rule.
 * `assigned_user_id` / `assigned_position_id` are kept alongside `user_id` for
 * downstream context (e.g. position-linked wiring), but they are NOT recipient
 * keys — `lib/notify/recipients.ts` reads `user_id`/`user_ids` only.
 */

/** `task_complete`: the completer earns the tokens (recipient) and is the actor. */
export function buildTaskCompleteEvent(input: {
  taskId: string;
  kind: string;
  tokenValue: number | null;
  userId: string;
}): EventPayload {
  return {
    task_id: input.taskId,
    kind: input.kind,
    token_value: input.tokenValue,
    user_id: input.userId,
    actor_id: input.userId,
  };
}

/**
 * `task_assigned`: someone (or a position) just got a to-do. Emits `user_id`
 * as the recipient when a person is the assignee; a position-only assignment
 * carries no `user_id` (nobody to notify yet) and the recipient extractor
 * correctly resolves it to "no one".
 */
export function buildTaskAssignedEvent(input: {
  taskId: string;
  assignedUserId: string | null;
  assignedPositionId?: string | null;
  actorId?: string | null;
  kind?: string;
  ref?: unknown;
  notifyDiscord?: boolean;
  discordChannelId?: string | null;
}): EventPayload {
  const payload: EventPayload = {
    task_id: input.taskId,
    assigned_position_id: input.assignedPositionId ?? null,
  };
  // Kept for downstream context; not a recipient key.
  payload.assigned_user_id = input.assignedUserId;
  if (input.assignedUserId) {
    payload.user_id = input.assignedUserId;
  }
  if (input.actorId) {
    payload.actor_id = input.actorId;
  }
  if (input.kind) {
    payload.kind = input.kind;
  }
  if (input.ref !== undefined) {
    payload.ref = input.ref as EventPayload[string];
  }
  // Per-item Discord routing (ARCHITECTURE.md notify_discord flag + target
  // channel): forward the flag so the Discord side can honor a per-task
  // opt-out / channel override instead of only the global per-event-key route.
  if (input.notifyDiscord !== undefined) {
    payload.notify_discord = input.notifyDiscord;
  }
  if (input.discordChannelId) {
    payload.discord_channel_id = input.discordChannelId;
  }
  return payload;
}

/** `task_overdue`: notify whoever owns the now-overdue task. */
export function buildTaskOverdueEvent(input: {
  taskId: string;
  title: string;
  assignedUserId: string | null;
  assignedPositionId: string | null;
}): EventPayload {
  const payload: EventPayload = {
    task_id: input.taskId,
    title: input.title,
    assigned_position_id: input.assignedPositionId,
  };
  payload.assigned_user_id = input.assignedUserId;
  if (input.assignedUserId) {
    payload.user_id = input.assignedUserId;
  }
  return payload;
}
