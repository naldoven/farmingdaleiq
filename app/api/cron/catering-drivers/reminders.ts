import {
  ACTIVE_DELIVERY_STAGES,
  DELIVERY_PLATFORMS,
  REMINDER_KINDS,
  buildReminderEvents,
  planDueReminders,
  type DeliveryPlatform,
  type ReminderKind,
  type ReminderOrder,
} from "@/app/(app)/catering/drivers/logic";
import type { createServiceRoleClient } from "@/lib/supabase/server";
import { addStoreCalendarDays, storeLocalDate } from "@/lib/time";

type Admin = ReturnType<typeof createServiceRoleClient>;

export type DriverReminderResult = {
  status: "idle" | "sent" | "error";
  claimed?: number;
  events?: number;
  error?: string;
};

function asPlatform(value: string): DeliveryPlatform {
  return (DELIVERY_PLATFORMS as readonly string[]).includes(value) ? (value as DeliveryPlatform) : "roadway";
}

function asKind(value: string): ReminderKind | null {
  return (REMINDER_KINDS as readonly string[]).includes(value) ? (value as ReminderKind) : null;
}

/**
 * One cron tick of the driver reminders (ARCHITECTURE.md "Catering" > "Driver
 * reminders"). Loads the delivery orders in play, asks planDueReminders what is
 * due, then claims each (order, kind) in catering_driver_reminders before
 * sending. The table's unique key means two overlapping runs cannot both claim
 * the same reminder: the insert ignores duplicates and returns only the rows
 * this run created, and only those are sent. If queuing the messages fails,
 * the claim is released so the next minute retries instead of losing it.
 *
 * Sending is one app_events insert. The every-5-minute consumer
 * (lib/notify/events.ts) turns it into the bell, a push, and the Discord post.
 */
export async function runDriverReminders(supabase: Admin, now: Date): Promise<DriverReminderResult> {
  const today = storeLocalDate(now);
  // Today, tomorrow, and the day after: Saturday's night pass covers Monday.
  const dates = [today, addStoreCalendarDays(today, 1), addStoreCalendarDays(today, 2)];

  const { data: orderRows, error: ordersError } = await supabase
    .from("catering_orders")
    .select("id, guest_name, event_date, event_time, delivery_platform, created_at")
    .eq("fulfillment", "delivery")
    .in("stage", [...ACTIVE_DELIVERY_STAGES])
    .in("event_date", dates);
  if (ordersError) return { status: "error", error: ordersError.message };
  if (!orderRows || orderRows.length === 0) return { status: "idle" };

  const orderIds = orderRows.map((row) => row.id);
  const [driversResult, logResult, daypartsResult, setupsResult, settingsResult] = await Promise.all([
    supabase.from("catering_order_drivers").select("order_id").in("order_id", orderIds),
    supabase
      .from("catering_driver_reminders")
      .select("order_id, kind, sent_at, folded, recipient_ids")
      .in("order_id", orderIds),
    supabase.from("day_parts").select("id, name, start_time, end_time"),
    supabase
      .from("setups")
      .select("day_part_id, shift_leader_id")
      .eq("date", today)
      .not("posted_at", "is", null)
      .not("shift_leader_id", "is", null),
    supabase.from("catering_driver_settings").select("escalation_profile_id, reminders_live_from").maybeSingle(),
  ]);
  for (const result of [driversResult, logResult, daypartsResult, setupsResult, settingsResult]) {
    if (result.error) return { status: "error", error: result.error.message };
  }

  const reserved = new Set((driversResult.data ?? []).map((row) => row.order_id));
  const orders: ReminderOrder[] = orderRows.map((row) => ({
    id: row.id,
    guestName: row.guest_name,
    eventDate: row.event_date,
    eventTime: row.event_time,
    platform: asPlatform(row.delivery_platform),
    createdAt: row.created_at,
    reserved: reserved.has(row.id),
  }));

  const dayparts = daypartsResult.data ?? [];
  const daypartName = new Map(dayparts.map((d) => [d.id, d.name]));
  const leadersByDaypart: Record<string, string[]> = {};
  for (const setup of setupsResult.data ?? []) {
    const name = setup.day_part_id ? daypartName.get(setup.day_part_id) : undefined;
    if (!name || !setup.shift_leader_id) continue;
    const ids = (leadersByDaypart[name] ??= []);
    if (!ids.includes(setup.shift_leader_id)) ids.push(setup.shift_leader_id);
  }

  const log = (logResult.data ?? []).flatMap((row) => {
    const kind = asKind(row.kind);
    return kind
      ? [{ orderId: row.order_id, kind, sentAt: row.sent_at, folded: row.folded, recipientIds: row.recipient_ids }]
      : [];
  });

  const due = planDueReminders({
    now,
    orders,
    log,
    dayparts: dayparts.map((d) => ({ name: d.name, start: d.start_time, end: d.end_time })),
    leadersByDaypart,
    escalationContactId: settingsResult.data?.escalation_profile_id ?? null,
    liveFrom: settingsResult.data?.reminders_live_from ?? null,
  });
  if (due.length === 0) return { status: "idle" };

  const sentAt = now.toISOString();
  const { data: claimedRows, error: claimError } = await supabase
    .from("catering_driver_reminders")
    .upsert(
      due.map((reminder) => ({
        order_id: reminder.orderId,
        kind: reminder.kind,
        recipient_ids: reminder.recipientIds,
        folded: reminder.folded,
        sent_at: sentAt,
      })),
      { onConflict: "order_id,kind", ignoreDuplicates: true },
    )
    .select("order_id, kind");
  if (claimError) return { status: "error", error: claimError.message };

  const claimed = new Set((claimedRows ?? []).map((row) => `${row.order_id}|${row.kind}`));
  const mine = due.filter((reminder) => claimed.has(`${reminder.orderId}|${reminder.kind}`));
  const events = buildReminderEvents(mine, orders, today);
  if (events.length === 0) return { status: "sent", claimed: mine.length, events: 0 };

  const { error: insertError } = await supabase
    .from("app_events")
    .insert(events.map((event) => ({ event_key: event.eventKey, payload: event.payload })));
  if (insertError) {
    // Release only this run's claims (same sent_at), so the next tick retries.
    const { error: releaseError } = await supabase
      .from("catering_driver_reminders")
      .delete()
      .eq("sent_at", sentAt)
      .in(
        "order_id",
        mine.map((reminder) => reminder.orderId),
      );
    if (releaseError) console.error("driver reminders: failed to release claims", releaseError.message);
    return { status: "error", error: insertError.message };
  }

  return { status: "sent", claimed: mine.length, events: events.length };
}
