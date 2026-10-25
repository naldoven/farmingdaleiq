import { formatTomorrowDigest, isConfirmationCallDone } from "@/app/(app)/catering/logic";
import type { createServiceRoleClient } from "@/lib/supabase/server";
import { addStoreCalendarDays, storeDateTimeInputToIso, storeHour, storeLocalDate } from "@/lib/time";

/** First store-time hour (24h) the digest may go out. One post a night, from the first run at or after 6 PM. */
export const DIGEST_STORE_HOUR = 18;

const JOB = "catering-tomorrow-digest";

export type DigestResult = {
  status: "queued" | "too_early" | "already_sent" | "error";
  error?: string;
};

/**
 * Queues one Discord digest of tomorrow's catering orders per store day. The
 * cron runs every minute and two runs can overlap, so the evening is claimed
 * before anything is read.
 *
 * The claim is a compare-and-set on a job_cursors row: set last_event_at to
 * now only where it is null or older than today's store midnight. Postgres
 * locks the row for the update, so when two runs race, one update matches and
 * the other sees the new value and matches nothing. The loser reports
 * already_sent and writes nothing. last_event_at is reused as the "last digest"
 * instant instead of adding a table: the schema stays untouched, the column is
 * already a timestamp, and job_cursors is service-role only, which is the only
 * caller here.
 *
 * The post itself is one app_events row. The every-5-minute consumer
 * (lib/notify/events.ts) routes it through discord_event_routes and the outbox
 * dedupes per app_events id, so that single insert is the whole post.
 */
export async function queueTomorrowDigest(
  supabase: ReturnType<typeof createServiceRoleClient>,
  now: Date,
): Promise<DigestResult> {
  const hour = storeHour(now);
  if (hour === null || hour < DIGEST_STORE_HOUR) return { status: "too_early" };

  const nowIso = now.toISOString();
  const dayStartIso = storeDateTimeInputToIso(`${storeLocalDate(now)}T00:00`);
  if (!dayStartIso) return { status: "error", error: "could not compute store midnight" };

  // Fast path: after the digest goes out, the remaining ~hundreds of runs that
  // night stop here with one read instead of an upsert and an update each. It
  // is only an optimization. The compare-and-set below stays the real
  // once-a-night guard, so two runs that both pass this check still race
  // safely on it. The value is also kept to restore if the claim must be released.
  const { data: cursor, error: cursorError } = await supabase
    .from("job_cursors")
    .select("last_event_at")
    .eq("job_name", JOB)
    .maybeSingle();
  if (cursorError) return { status: "error", error: cursorError.message };
  const previousValue: string | null = cursor?.last_event_at ?? null;
  if (previousValue && new Date(previousValue).getTime() >= new Date(dayStartIso).getTime()) {
    return { status: "already_sent" };
  }

  // The row must exist before the compare-and-set can match anything. A no-op
  // when an earlier run already created it.
  const { error: seedError } = await supabase
    .from("job_cursors")
    .upsert({ job_name: JOB, updated_at: nowIso }, { onConflict: "job_name", ignoreDuplicates: true });
  if (seedError) return { status: "error", error: seedError.message };

  const { data: claimed, error: claimError } = await supabase
    .from("job_cursors")
    .update({ last_event_at: nowIso, updated_at: nowIso })
    .eq("job_name", JOB)
    .or(`last_event_at.is.null,last_event_at.lt.${dayStartIso}`)
    .select("job_name");
  if (claimError) return { status: "error", error: claimError.message };
  if (!claimed || claimed.length === 0) return { status: "already_sent" };

  // From here a failure releases the claim, so the next minute retries instead
  // of skipping the night. Filtering on our own timestamp means we only undo
  // our claim, never a later one.
  const release = async (message: string): Promise<DigestResult> => {
    const { error: releaseError } = await supabase
      .from("job_cursors")
      .update({ last_event_at: previousValue, updated_at: nowIso })
      .eq("job_name", JOB)
      .eq("last_event_at", nowIso);
    if (releaseError) {
      console.error("catering digest: failed to release claim", releaseError.message);
    }
    return { status: "error", error: message };
  };

  const tomorrow = addStoreCalendarDays(storeLocalDate(now), 1);
  const { data: orders, error: ordersError } = await supabase
    .from("catering_orders")
    .select("id, guest_name, event_time, headcount, fulfillment, stage")
    .eq("event_date", tomorrow)
    .neq("stage", "closed")
    .neq("stage", "cancelled");
  if (ordersError) return release(ordersError.message);

  const rows = orders ?? [];
  const callRowsByOrder = new Map<string, { done: boolean }[]>();
  if (rows.length > 0) {
    const { data: callRows, error: callError } = await supabase
      .from("catering_checklist_items")
      .select("order_id, done")
      .in(
        "order_id",
        rows.map((order) => order.id),
      )
      .eq("stage", "confirm");
    if (callError) return release(callError.message);
    for (const item of callRows ?? []) {
      const list = callRowsByOrder.get(item.order_id) ?? [];
      list.push({ done: item.done });
      callRowsByOrder.set(item.order_id, list);
    }
  }

  // An order with no Confirmation Call rows counts as not called (zero rows is
  // "not done" by design, see isConfirmationCallDone).
  const digestOrders = rows.map((order) => ({
    guestName: order.guest_name,
    eventTime: order.event_time,
    headcount: order.headcount,
    fulfillment: order.fulfillment,
    stage: order.stage,
    callDone: isConfirmationCallDone(callRowsByOrder.get(order.id) ?? []),
  }));
  const message = formatTomorrowDigest({ tomorrow, orders: digestOrders });

  const { error: insertError } = await supabase.from("app_events").insert({
    event_key: "catering_tomorrow_digest",
    payload: {
      digestDate: tomorrow,
      orderCount: digestOrders.length,
      callsOutstanding: digestOrders.filter((order) => !order.callDone).length,
      title: "Tomorrow's catering",
      message,
    },
  });
  if (insertError) return release(insertError.message);

  return { status: "queued" };
}
