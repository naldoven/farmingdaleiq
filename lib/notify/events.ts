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
 * `app_events.processed_at` at all; instead it rescans the same window of
 * `app_events` on every run and makes its OWN downstream writes (
 * `notifications`, `discord_outbox`) idempotent per source event id — see
 * lib/notify/dedupe.ts and lib/discord/outbox.ts's `enqueueDiscordMessage`.
 * That makes this function safe to call as often as the scheduling job
 * likes, and safe to run concurrently with S7's consumer.
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

interface AppEventRow {
  id: string;
  event_key: string;
  payload: unknown;
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
  const { data: events, error } = await client
    .from("app_events")
    .select("id, event_key, payload")
    .in("event_key", HANDLED_EVENT_KEYS)
    .order("created_at", { ascending: true })
    .limit(limit);

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

  for (const evt of (events ?? []) as AppEventRow[]) {
    result.scanned += 1;
    const key = evt.event_key as EventKey;
    const payload = (evt.payload && typeof evt.payload === "object" ? evt.payload : {}) as EventPayload;
    const recipients = extractRecipientIds(payload);

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
      // (flag off) should include `notifyDiscord: false` in the emitEvent
      // payload, which this consumer honors ahead of the global
      // discord_event_routes.enabled toggle.
      const notifyDiscordOverride = payload.notifyDiscord ?? payload.notify_discord;
      if (notifyDiscordOverride === false) {
        continue;
      }

      const route = await getDiscordRoute(key, client);

      if (route) {
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
          { channelId: route.channelId, message, sourceEventId: evt.id },
          client,
        );
        if (queued) result.discordQueued += 1;
      }
    }
  }

  return result;
}
