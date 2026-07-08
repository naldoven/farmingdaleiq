import type { EventPayload } from "@/lib/events/bus";

/**
 * Recipient-id extraction from an `app_events.payload`.
 *
 * The CANONICAL recipient contract (lib/events/bus.ts `RecipientFields`) is
 * `user_id` (one recipient) and `user_ids` (many) — every producer conforms
 * to those two names, and this extractor reads BOTH. The remaining aliases
 * below are kept only as a defensive safety net for producers that predate
 * the canonical rename; new producers must use `user_id`/`user_ids`.
 *
 * Deliberately NOT recognized: `actor_id` (who caused the event) and legacy
 * actor-shaped keys like `completed_by`/`completedBy`/`assigned_user_id`.
 * The actor is not a recipient — recording who did something must never
 * accidentally notify or credit them.
 *
 * Never throws. A payload with no recognizable recipient field (e.g. a
 * store-wide broadcast, or a producer that hasn't landed yet) resolves to
 * `[]`, which callers must treat as "no one to notify" rather than an
 * error — a malformed/incomplete payload from another module must never
 * crash the notification drain job.
 */
export function extractRecipientIds(payload: EventPayload): string[] {
  const ids = new Set<string>();

  const singularKeys = [
    // canonical
    "user_id",
    // legacy safety net
    "userId",
    "recipientId",
    "recipient_id",
    "assigneeId",
    "assignee_id",
    "targetUserId",
    "target_user_id",
    "issuedTo",
    "issued_to",
  ];
  const pluralKeys = [
    // canonical
    "user_ids",
    // legacy safety net
    "userIds",
    "recipientIds",
    "recipient_ids",
    "assigneeIds",
    "assignee_ids",
  ];

  for (const key of singularKeys) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) {
      ids.add(value);
    }
  }

  for (const key of pluralKeys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.length > 0) {
          ids.add(entry);
        }
      }
    }
  }

  return [...ids];
}
