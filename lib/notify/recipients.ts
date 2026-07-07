import type { EventPayload } from "@/lib/events/bus";

/**
 * Defensive recipient-id extraction from an `app_events.payload`. Every
 * producer (the other P1 streams) owns its own `emitEvent(...)` call sites,
 * and the exact payload shape per event key isn't a formally typed contract
 * yet (P2 wiring is expected to firm this up once every producer has
 * landed — see PLAN.md P2 "Wiring agent"). Until then this looks for the
 * field names a producer is most likely to use and returns every match it
 * finds, deduped.
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
    "userId",
    "user_id",
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
    "userIds",
    "user_ids",
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
