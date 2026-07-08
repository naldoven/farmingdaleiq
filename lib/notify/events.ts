import { createServiceRoleClient } from "@/lib/supabase/server";
import type { EventKey, EventPayload } from "@/lib/events/bus";
import { extractRecipientIds } from "@/lib/notify/recipients";
import { buildNotificationContent, NOTIFIABLE_EVENT_KEYS } from "@/lib/notify/templates";
import { withEventMarker, eventMarkerLikePattern } from "@/lib/notify/dedupe";
import { isDeadSubscriptionError, sendWebPush } from "@/lib/notify/push";
import { DISCORD_ROUTABLE_EVENT_KEYS, buildDiscordMessage } from "@/lib/discord/format";
import { getDiscordRoute } from "@/lib/discord/routes";
import { enqueueDiscordMessage } from "@/lib/discord/outbox";

type SupabaseLike = ReturnType<typeof createServiceRoleClient>;

/**
 * The event-bus consumer for S10 (PLAN.md S10 brief: "event-bus consumer
 * mapping event keys to in-app notifications + web push..., Discord
 * settings page..., outbox worker...").
 *
 * `app_events` is a P0-owned, shared table (docs/agent-map.md). It carries
 * one `processed_at` column, not one per consumer, and S7 (tokens) is
 * expected to independently consume a different (overlapping, for
 * `top_performer`) subset of the same keys for token math. Two consumers
 * racing to set/clear the same shared column would either drop events for
 * whichever consumer loses the race, or double-fire for whichever wins it
 * repeatedly — neither is acceptable, and coordinating with S7's consumer
 * is out of scope for this stream (PLAN.md hard boundary: "do not reach
 * into other modules"). So this consumer never reads or writes
 * `app_events.processed_at` at all. Instead it keeps its OWN durable cursor
 * in `job_cursors` (keyed by `PROCESS_EVENTS_JOB` — a per-job row, so S7 can
 * keep an independent cursor under a different key without either consumer
 * racing on the shared column) and pages forward over
 * `app_events(created_at, id)`. This fixes parity finding #7: the previous
 * version re-fetched the oldest 200 matching rows every run, so once
 * cumulative volume passed 200 the window never advanced and every newer
 * event was skipped forever.
 *
 * The cursor only advances AFTER a batch is fully processed, and every
 * downstream write (`notifications`, `discord_outbox`) is still idempotent
 * per source event id (see lib/notify/dedupe.ts and
 * lib/discord/outbox.ts's `enqueueDiscordMessage`). So delivery is
 * at-least-once: a crash mid-batch leaves the cursor where it was and the
 * whole batch is safely re-scanned next run, and two overlapping runs just
 * do redundant (deduped) work rather than dropping or double-firing events.
 */
export interface ProcessEventsResult {
  scanned: number;
  notificationsCreated: number;
  pushSent: number;
  pushFailed: number;
  discordQueued: number;
}

const HANDLED_EVENT_KEYS: EventKey[] = [
  ...new Set([...NOTIFIABLE_EVENT_KEYS, ...DISCORD_ROUTABLE_EVENT_KEYS]),
];

/** `job_cursors.job_name` this consumer owns. S7's token consumer keeps its own. */
const PROCESS_EVENTS_JOB = "process-events";

/**
 * Event keys that fan out to every active employee rather than to a
 * per-payload recipient. `broadcast` is a store-wide announcement, so it
 * carries no `user_id`; without this it would sit in NOTIFIABLE_EVENT_KEYS
 * and never create a single notification (parity finding: "broadcast is in
 * NOTIFIABLE_EVENT_KEYS but supplies no recipient"). A producer may still
 * scope a broadcast by including explicit `user_id`/`user_ids`, in which case
 * those win and no store-wide fan-out happens.
 */
const BROADCAST_ALL_KEYS = new Set<EventKey>(["broadcast"]);

interface AppEventRow {
  id: string;
  event_key: string;
  payload: unknown;
  created_at: string;
}

/**
 * Reads a per-instance Discord channel override from the payload. Canonical
 * key is `discord_channel_id` (lib/events/bus.ts `DiscordControlFields`);
 * `discordChannelId` is accepted as a camelCase alias. Returns undefined when
 * absent, so the caller falls back to the global `discord_event_routes`
 * channel.
 */
function payloadChannelOverride(payload: EventPayload): string | undefined {
  const value = payload.discord_channel_id ?? payload.discordChannelId;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Resolves every active employee id, for store-wide broadcast fan-out. */
async function allActiveRecipientIds(client: SupabaseLike): Promise<string[]> {
  const { data } = await client.from("profiles").select("id").eq("active", true);
  return (data ?? [])
    .map((row) => (row as { id?: unknown }).id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * Inserts an in-app notification for `userId` unless one already exists for
 * this exact `(userId, eventKey, eventId)` — see lib/notify/dedupe.ts.
 */
async function createNotificationIfNew(
  client: SupabaseLike,
  input: { userId: string; eventKey: EventKey; eventId: string; title: string; body?: string; link?: string },
): Promise<boolean> {
  const link = withEventMarker(input.link, input.eventId);

  const { data: existing } = await client
    .from("notifications")
    .select("id")
    .eq("user_id", input.userId)
    .eq("kind", input.eventKey)
    .ilike("link", eventMarkerLikePattern(input.eventId))
    .limit(1)
    .maybeSingle();

  if (existing) return false;

  const { error } = await client.from("notifications").insert({
    user_id: input.userId,
    kind: input.eventKey,
    title: input.title,
    body: input.body ?? null,
    link,
  });

  if (error) {
    throw new Error(`createNotificationIfNew failed: ${error.message}`);
  }

  return true;
}

/**
 * Best-effort Web Push fan-out to every subscription `userId` has
 * registered. Each subscription is sent independently so one dead endpoint
 * never blocks delivery to the user's other devices; subscriptions that the
 * push service reports as gone (404/410) are pruned.
 */
async function fanOutPush(
  client: SupabaseLike,
  userId: string,
  payload: { title: string; body?: string; link?: string },
): Promise<{ sent: number; failed: number }> {
  const { data: subs } = await client
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  let sent = 0;
  let failed = 0;

  for (const sub of subs ?? []) {
    try {
      await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      if (isDeadSubscriptionError(error)) {
        await client.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }

  return { sent, failed };
}

/**
 * Drains recent `app_events` rows into in-app notifications, Web Push, and
 * the Discord outbox. Meant to run as a periodic job (see
 * app/api/jobs/process-events/route.ts — wire it to Vercel Cron / a
 * Supabase scheduled function; see this stream's report for the suggested
 * cadence).
 */
export async function processAppEvents(
  limit = 200,
  client: SupabaseLike = createServiceRoleClient(),
): Promise<ProcessEventsResult> {
  const { data: cursor } = await client
    .from("job_cursors")
    .select("last_event_at, last_event_id")
    .eq("job_name", PROCESS_EVENTS_JOB)
    .maybeSingle();

  let query = client
    .from("app_events")
    .select("id, event_key, payload, created_at")
    .in("event_key", HANDLED_EVENT_KEYS)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);

  // Keyset pagination over (created_at, id): strictly after the cursor, so
  // the window always advances even past `limit` cumulative events. The
  // `id` tiebreaker (via the job_cursors composite) means two events sharing
  // an exact created_at are never skipped at the batch boundary.
  if (cursor?.last_event_at) {
    const at = cursor.last_event_at;
    const id = cursor.last_event_id ?? "";
    query = query.or(`created_at.gt.${at},and(created_at.eq.${at},id.gt.${id})`);
  }

  const { data: events, error } = await query;

  if (error) {
    throw new Error(`processAppEvents failed: ${error.message}`);
  }

  const result: ProcessEventsResult = {
    scanned: 0,
    notificationsCreated: 0,
    pushSent: 0,
    pushFailed: 0,
    discordQueued: 0,
  };

  const scannedEvents = (events ?? []) as AppEventRow[];

  for (const evt of scannedEvents) {
    result.scanned += 1;
    const key = evt.event_key as EventKey;
    const payload = (evt.payload && typeof evt.payload === "object" ? evt.payload : {}) as EventPayload;
    let recipients = extractRecipientIds(payload);

    // Store-wide broadcast fan-out: if a broadcast-to-all key carries no
    // explicit recipient, resolve to every active employee so the
    // announcement actually reaches the notification center.
    if (recipients.length === 0 && BROADCAST_ALL_KEYS.has(key)) {
      recipients = await allActiveRecipientIds(client);
    }

    if ((NOTIFIABLE_EVENT_KEYS as string[]).includes(key)) {
      const content = buildNotificationContent(key, payload);

      for (const userId of recipients) {
        const created = await createNotificationIfNew(client, {
          userId,
          eventKey: key,
          eventId: evt.id,
          title: content.title,
          body: content.body,
          link: content.link,
        });

        if (created) {
          result.notificationsCreated += 1;
          const pushResult = await fanOutPush(client, userId, content);
          result.pushSent += pushResult.sent;
          result.pushFailed += pushResult.failed;
        }
      }
    }

    if ((DISCORD_ROUTABLE_EVENT_KEYS as string[]).includes(key)) {
      // Per-instance opt-out (ARCHITECTURE.md "Discord integration" > "The
      // flag": tasks/task_templates/checklist_schedules/work_orders/
      // pm_schedules each carry a `notify_discord` column). This stream
      // doesn't own those tables, so it can't read the column directly —
      // instead, a producer that wants to suppress Discord for one instance
      // (flag off) includes `notify_discord: false` (canonical) in the
      // emitEvent payload (see lib/events/bus.ts `DiscordControlFields`;
      // `notifyDiscord` accepted as a camelCase alias), which this consumer
      // honors ahead of the global discord_event_routes.enabled toggle.
      const notifyDiscordOverride = payload.notify_discord ?? payload.notifyDiscord;
      if (notifyDiscordOverride === false) {
        continue;
      }

      const route = await getDiscordRoute(key, client);

      if (route) {
        // Per-instance channel override: a producer may pin one event to a
        // specific channel via `discord_channel_id`, which wins over the
        // global route's channel. The route still gates whether Discord is
        // enabled for this key at all, so an override can't post to a key
        // routing has been turned off for.
        const channelId = payloadChannelOverride(payload) ?? route.channelId;

        const primaryRecipient = recipients[0];
        let recipientName: string | undefined;
        let recipientDiscordId: string | null | undefined;

        if (primaryRecipient) {
          const { data: profile } = await client
            .from("profiles")
            .select("name, discord_user_id")
            .eq("id", primaryRecipient)
            .maybeSingle();
          recipientName = profile?.name;
          recipientDiscordId = profile?.discord_user_id;
        }

        const message = buildDiscordMessage(key, payload, { recipientName, recipientDiscordId });
        const { queued } = await enqueueDiscordMessage(
          { channelId, message, sourceEventId: evt.id },
          client,
        );
        if (queued) result.discordQueued += 1;
      }
    }
  }

  // Advance the durable cursor only after the whole batch is processed. Rows
  // came back ordered by (created_at, id) ascending, so the last one is the
  // batch high-water mark. A mid-batch throw above skips this, leaving the
  // cursor where it was so the batch is safely re-scanned next run.
  if (scannedEvents.length > 0) {
    const last = scannedEvents[scannedEvents.length - 1];
    const { error: cursorError } = await client.from("job_cursors").upsert(
      {
        job_name: PROCESS_EVENTS_JOB,
        last_event_at: last.created_at,
        last_event_id: last.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "job_name" },
    );

    if (cursorError) {
      throw new Error(`processAppEvents cursor advance failed: ${cursorError.message}`);
    }
  }

  return result;
}
