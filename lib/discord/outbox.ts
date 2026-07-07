import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/db/types";
import { sendDiscordWebhook, type DiscordWebhookMessage } from "@/lib/discord/client";

type SupabaseLike = ReturnType<typeof createServiceRoleClient>;

/** Backoff schedule by attempt number (ARCHITECTURE.md "Discord integration" > Reliability). */
const BACKOFF_MINUTES = [1, 5, 15, 30, 60];
const MAX_ATTEMPTS = 5;

/** Pure — unit-testable without touching the database. */
export function computeNextRetryDelayMinutes(attemptsAfterThisFailure: number): number {
  const idx = Math.min(Math.max(attemptsAfterThisFailure - 1, 0), BACKOFF_MINUTES.length - 1);
  return BACKOFF_MINUTES[idx];
}

export interface EnqueueDiscordMessageInput {
  channelId: string;
  message: DiscordWebhookMessage;
  /** app_events.id this message was generated from — the idempotency key (see below). */
  sourceEventId: string;
}

/**
 * Queues one Discord message onto `discord_outbox`.
 *
 * Idempotent by `sourceEventId`: `discord_outbox.payload` is jsonb, so the
 * source event id is embedded in it (`source_event_id`) and checked with a
 * `@>` containment query before insert. If a row already exists for this
 * (channel, source event) pair — pending, sent, or failed — this is a
 * no-op. That is the "safe to run twice" guarantee the event-drain job
 * (lib/notify/events.ts) needs, since it has no shared cursor over
 * `app_events` (see that file's header for why) and may rescan the same
 * rows on its next run.
 */
export async function enqueueDiscordMessage(
  input: EnqueueDiscordMessageInput,
  client: SupabaseLike = createServiceRoleClient(),
): Promise<{ queued: boolean }> {
  const { data: existing } = await client
    .from("discord_outbox")
    .select("id")
    .eq("channel_id", input.channelId)
    .contains("payload", { source_event_id: input.sourceEventId })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { queued: false };
  }

  const { error } = await client.from("discord_outbox").insert({
    channel_id: input.channelId,
    payload: {
      ...input.message,
      source_event_id: input.sourceEventId,
    } as Json,
  });

  if (error) {
    throw new Error(`enqueueDiscordMessage failed: ${error.message}`);
  }

  return { queued: true };
}

export interface DeliverOutboxResult {
  delivered: number;
  retried: number;
  failed: number;
}

type OutboxRow = Database["public"]["Tables"]["discord_outbox"]["Row"];

/**
 * Drains `discord_outbox`: sends every due `pending` row (no `next_retry_at`
 * or one already in the past) and updates its status. On failure, bumps
 * `attempts` and schedules the next retry with exponential backoff; after
 * `MAX_ATTEMPTS` it's marked `failed` for good so a permanently-broken
 * webhook can't retry forever.
 *
 * Meant to run as a periodic job (see app/api/jobs/discord-outbox/route.ts
 * — "scheduled function" per PLAN.md S10 brief; wire it up to Vercel Cron or
 * a Supabase scheduled function once ops picks a cadence, see this stream's
 * report for the exact suggestion). Safe to run concurrently with itself:
 * each row is only ever moved forward (pending -> sent|failed, or pending ->
 * pending with a later next_retry_at), never duplicated, so overlapping
 * runs just do some redundant work rather than double-post.
 */
export async function deliverPendingOutbox(
  limit = 25,
  client: SupabaseLike = createServiceRoleClient(),
): Promise<DeliverOutboxResult> {
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await client
    .from("discord_outbox")
    .select("id, channel_id, payload, attempts")
    .eq("status", "pending")
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`deliverPendingOutbox failed: ${error.message}`);
  }

  const result: DeliverOutboxResult = { delivered: 0, retried: 0, failed: 0 };

  for (const row of (rows ?? []) as Pick<OutboxRow, "id" | "channel_id" | "payload" | "attempts">[]) {
    const { data: channel } = await client
      .from("discord_channels")
      .select("webhook_url, active")
      .eq("id", row.channel_id)
      .maybeSingle();

    if (!channel || !channel.active) {
      await client.from("discord_outbox").update({ status: "failed" }).eq("id", row.id);
      result.failed += 1;
      continue;
    }

    try {
      const payload = row.payload as { content?: string };
      await sendDiscordWebhook(channel.webhook_url, { content: payload.content ?? "" });
      await client
        .from("discord_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", row.id);
      result.delivered += 1;
    } catch {
      const attempts = row.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await client.from("discord_outbox").update({ status: "failed", attempts }).eq("id", row.id);
        result.failed += 1;
      } else {
        const delayMinutes = computeNextRetryDelayMinutes(attempts);
        const nextRetryAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
        await client
          .from("discord_outbox")
          .update({ attempts, next_retry_at: nextRetryAt })
          .eq("id", row.id);
        result.retried += 1;
      }
    }
  }

  return result;
}
