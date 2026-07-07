/**
 * `notifications` (ARCHITECTURE.md data model) has no `source_event_id`
 * column of its own, and it's a P0-frozen table (docs/agent-map.md) so S10
 * cannot add one. To make the event-drain job idempotent — safe to run
 * twice over the same `app_events` rows, which it will (there is no shared
 * per-consumer cursor; see lib/notify/events.ts header) — this embeds the
 * source `app_events.id` into the notification's `link` as a query-string
 * marker, and the drain job checks for an existing marker before inserting.
 *
 * A router ignores unknown query params, so this doesn't change where a
 * click navigates; it just gives the drain job something durable and
 * queryable to dedupe on without a schema change.
 */
const MARKER_PARAM = "evt";

export function withEventMarker(link: string | undefined, eventId: string): string {
  const base = link && link.length > 0 ? link : "/notifications";
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${MARKER_PARAM}=${eventId}`;
}

/** LIKE pattern for finding a notification already tagged with `eventId`. */
export function eventMarkerLikePattern(eventId: string): string {
  return `%${MARKER_PARAM}=${eventId}%`;
}
