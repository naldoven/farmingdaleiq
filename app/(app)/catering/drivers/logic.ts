import { formatDigestClock } from "@/app/(app)/catering/logic";
import { neutralizeDiscordMentions } from "@/lib/discord/mentions";
import { addStoreCalendarDays, formatStoreDateTimeInput, storeDateTimeInputToIso, storeLocalDate } from "@/lib/time";

/**
 * Driver reservations (ARCHITECTURE.md "Catering" > "Driver reservations" and
 * "Driver reminders"). Pure: the cron (app/api/cron/catering-drivers) and the
 * Drivers page load the rows and hand them here, so every timing rule is unit
 * tested against store wall-clock times, DST included.
 */

export const DELIVERY_PLATFORMS = ["roadway", "ezcater"] as const;
export type DeliveryPlatform = (typeof DELIVERY_PLATFORMS)[number];
export const DELIVERY_PLATFORM_LABELS: Record<DeliveryPlatform, string> = {
  roadway: "Roadway",
  ezcater: "ezCater",
};

export const CAR_SIZES = ["small", "large"] as const;
export type CarSize = (typeof CAR_SIZES)[number];
export const CAR_SIZE_LABELS: Record<CarSize, string> = { small: "Small car", large: "Large car" };

/** Orders a driver can still be reserved for; the insert policy checks the same list. */
export const ACTIVE_DELIVERY_STAGES = ["new", "confirm", "setup", "out"] as const;

// SEED-DEFAULT: the guest count that needs a large car. Jasmin's review page
// asks for the real number (question 3).
export const LARGE_ORDER_HEADCOUNT = 40;

/** Most drivers an order can carry; big orders sometimes need a second car. */
export const MAX_DRIVERS_PER_ORDER = 4;

export const REMINDER_KINDS = [
  "night_ping",
  "night_last_call",
  "night_escalation",
  "morning_ping",
  "morning_last_call",
  "arrival",
  "before_60",
  "before_30_escalation",
] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export const ESCALATION_KINDS: ReadonlySet<ReminderKind> = new Set(["night_escalation", "before_30_escalation"]);

export function isEscalationKind(kind: ReminderKind): boolean {
  return ESCALATION_KINDS.has(kind);
}

/**
 * Store wall-clock times. Each reminder has a window: it goes out on the first
 * cron run inside it, so one missed during downtime still goes out late, but
 * never after the next step has taken over (a 7 PM ping is not sent at 10:30
 * PM, and a last call never wakes the Night leader after the Night daypart).
 */
export const REMINDER_TIMES = {
  nightPing: "19:00",
  nightLastCall: "22:00",
  nightClose: "23:00",
  nightEscalation: "06:00",
  nightEscalationClose: "08:00",
  morningPing: "07:00",
  morningLastCall: "08:00",
  morningClose: "09:00",
} as const;
export const BEFORE_PING_MINUTES = 60;
export const BEFORE_ESCALATION_MINUTES = 30;
/** A 60-minute ping or 30-minute escalation is skipped when the same order got one this recently. */
export const FOLD_MINUTES = 10;

export const NIGHT_DAYPART = "Night";
export const MORNING_DAYPART = "Morning";
/** noLeaderDaypart value when no daypart covers the current time at all. */
export const NO_DAYPART = "current";

const MINUTE_MS = 60_000;
const MAX_LISTED_ORDERS = 12;

export interface ReminderOrder {
  id: string;
  guestName: string;
  eventDate: string;
  /** Postgres time ("11:00:00"), the delivery time. */
  eventTime: string | null;
  platform: DeliveryPlatform;
  createdAt: string;
  reserved: boolean;
}

export interface ReminderLogRow {
  orderId: string;
  kind: ReminderKind;
  /** reminderSlot() of the order when it was sent; a rescheduled order starts over. */
  slot: string;
  sentAt: string;
  folded: boolean;
  recipientIds: string[];
}

export interface DaypartWindow {
  name: string;
  /** Postgres time, store wall clock. */
  start: string;
  end: string;
}

export interface ReminderContext {
  now: Date;
  /** Active delivery orders for the dates in play, reserved or not (counts need both). */
  orders: ReminderOrder[];
  log: ReminderLogRow[];
  dayparts: DaypartWindow[];
  /** shift_leader_id of today's posted setups, by daypart name. */
  leadersByDaypart: Record<string, string[]>;
  escalationContactId: string | null;
  /**
   * When reminders went live (catering_driver_settings.reminders_live_from,
   * stamped by the cron's first run). On go-live day every delivery is
   * unreserved in FIQ, even ones already reserved in Roadway, so deliveries
   * due on or before that store day that arrived before go-live are left
   * alone instead of escalating at once. Every later day gets the full
   * schedule, whenever in the evening go-live happened.
   */
  liveFrom?: string | null;
}

export interface DueReminder {
  orderId: string;
  kind: ReminderKind;
  /** Due but not sent: a ping about the same order went out moments earlier. */
  folded: boolean;
  recipientIds: string[];
  /** Set when no shift leader was posted, so the escalation contact got it instead. */
  noLeaderDaypart: string | null;
}

/** Sunday is the store's only closed day (matches cleaning_next_open_day). */
export function isStoreClosedDay(date: string): boolean {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay() === 0;
}

/** The open day whose evening runs the night pass for a delivery date. Saturday covers Monday. */
export function nightPassDate(eventDate: string): string {
  const dayBefore = addStoreCalendarDays(eventDate, -1);
  return isStoreClosedDay(dayBefore) ? addStoreCalendarDays(eventDate, -2) : dayBefore;
}

function storeInstant(date: string, clock: string): number {
  const iso = storeDateTimeInputToIso(`${date}T${clock.slice(0, 5)}`);
  return iso ? Date.parse(iso) : Number.NaN;
}

/**
 * The delivery slot a reminder was sent for. Part of the once-only key, so an
 * order moved to another day or time gets its reminders again instead of
 * keeping the ones already spent on the old slot.
 */
export function reminderSlot(order: Pick<ReminderOrder, "eventDate" | "eventTime">): string {
  return `${order.eventDate} ${order.eventTime?.slice(0, 5) ?? "none"}`;
}

/** The delivery instant, or null when the order has no usable time. */
export function deliveryInstant(order: Pick<ReminderOrder, "eventDate" | "eventTime">): number | null {
  if (!order.eventTime || !/^\d{2}:\d{2}/.test(order.eventTime)) return null;
  const at = storeInstant(order.eventDate, order.eventTime);
  return Number.isNaN(at) ? null : at;
}

/** Which pass first covered an order, from when it arrived. */
export type DriverPass = "night" | "morning" | "sameDay";

export function orderPass(order: Pick<ReminderOrder, "eventDate" | "createdAt">): DriverPass {
  const created = Date.parse(order.createdAt);
  if (!(created > storeInstant(nightPassDate(order.eventDate), REMINDER_TIMES.nightLastCall))) return "night";
  if (!(created > storeInstant(order.eventDate, REMINDER_TIMES.morningLastCall))) return "morning";
  return "sameDay";
}

function daypartAt(now: Date, dayparts: DaypartWindow[]): string | null {
  const clock = formatStoreDateTimeInput(now).slice(11, 16);
  const match = dayparts.find((d) => d.start.slice(0, 5) <= clock && clock < d.end.slice(0, 5));
  return match?.name ?? null;
}

/**
 * Every reminder due right now. The cron claims each row in
 * catering_driver_reminders (unique per order and kind) and only sends what
 * its own insert claimed, so this may safely be recomputed every minute.
 */
export function planDueReminders(ctx: ReminderContext): DueReminder[] {
  const now = ctx.now.getTime();
  const within = (start: number, end: number) => now >= start && now < end;

  const logByOrder = new Map<string, ReminderLogRow[]>();
  for (const row of ctx.log) {
    const rows = logByOrder.get(row.orderId) ?? [];
    rows.push(row);
    logByOrder.set(row.orderId, rows);
  }

  const contact = ctx.escalationContactId ? [ctx.escalationContactId] : [];
  const leadersFor = (daypart: string | null) => {
    const ids = daypart ? (ctx.leadersByDaypart[daypart] ?? []) : [];
    if (ids.length > 0) return { recipientIds: [...ids], noLeaderDaypart: null };
    return { recipientIds: contact, noLeaderDaypart: daypart ?? NO_DAYPART };
  };
  const currentDaypart = daypartAt(ctx.now, ctx.dayparts);
  const parsedLive = ctx.liveFrom ? Date.parse(ctx.liveFrom) : Number.NaN;
  const liveFrom = Number.isNaN(parsedLive) ? null : parsedLive;
  const liveDate = liveFrom === null ? null : storeLocalDate(new Date(liveFrom));

  const out: DueReminder[] = [];
  for (const order of ctx.orders) {
    if (order.reserved) continue;
    const delivery = deliveryInstant(order);
    if (delivery !== null && now >= delivery) continue;

    const parsedCreated = Date.parse(order.createdAt);
    const created = Number.isNaN(parsedCreated) ? 0 : parsedCreated;
    const pass = nightPassDate(order.eventDate);
    const nightPing = storeInstant(pass, REMINDER_TIMES.nightPing);
    const nightLastCall = storeInstant(pass, REMINDER_TIMES.nightLastCall);
    const nightClose = storeInstant(pass, REMINDER_TIMES.nightClose);
    const escalation = storeInstant(order.eventDate, REMINDER_TIMES.nightEscalation);
    const escalationClose = storeInstant(order.eventDate, REMINDER_TIMES.nightEscalationClose);
    const morningPing = storeInstant(order.eventDate, REMINDER_TIMES.morningPing);
    const morningLastCall = storeInstant(order.eventDate, REMINDER_TIMES.morningLastCall);
    const morningClose = storeInstant(order.eventDate, REMINDER_TIMES.morningClose);
    const dayClose = storeInstant(order.eventDate, REMINDER_TIMES.nightClose);
    if (liveFrom !== null && liveDate !== null && order.eventDate <= liveDate && created < liveFrom) continue;

    // A pass covers the orders that existed when it fired; anything newer is
    // picked up by the next step, so nobody is pinged twice in a few minutes.
    const isDue: Record<ReminderKind, boolean> = {
      night_ping: within(nightPing, nightLastCall) && created <= nightPing,
      night_last_call: within(nightLastCall, nightClose) && created <= nightLastCall,
      night_escalation: within(escalation, escalationClose) && created <= nightLastCall,
      morning_ping: within(morningPing, morningLastCall) && created <= morningPing,
      morning_last_call: within(morningLastCall, morningClose) && created <= morningLastCall,
      arrival: created > morningLastCall && now >= created && now < (delivery ?? dayClose),
      before_60:
        delivery !== null &&
        within(delivery - BEFORE_PING_MINUTES * MINUTE_MS, delivery - BEFORE_ESCALATION_MINUTES * MINUTE_MS),
      before_30_escalation: delivery !== null && within(delivery - BEFORE_ESCALATION_MINUTES * MINUTE_MS, delivery),
    };

    const history = logByOrder.get(order.id) ?? [];
    const slot = reminderSlot(order);
    const already = new Set(history.filter((row) => row.slot === slot).map((row) => row.kind));
    const due = REMINDER_KINDS.filter((kind) => isDue[kind] && !already.has(kind));
    if (due.length === 0) continue;

    const recentSince = now - FOLD_MINUTES * MINUTE_MS;
    const recently = (escalations: boolean) =>
      history.some(
        (row) => !row.folded && isEscalationKind(row.kind) === escalations && Date.parse(row.sentAt) > recentSince,
      );
    const foldBefore60 = due.some((k) => k !== "before_60" && !isEscalationKind(k)) || recently(false);
    const foldBefore30 = due.includes("night_escalation") || recently(true);

    for (const kind of due) {
      const folded = (kind === "before_60" && foldBefore60) || (kind === "before_30_escalation" && foldBefore30);
      if (folded) {
        out.push({ orderId: order.id, kind, folded: true, recipientIds: [], noLeaderDaypart: null });
        continue;
      }
      const target = isEscalationKind(kind)
        ? { recipientIds: contact, noLeaderDaypart: null }
        : kind.startsWith("night_")
          ? leadersFor(NIGHT_DAYPART)
          : kind.startsWith("morning_")
            ? leadersFor(MORNING_DAYPART)
            : leadersFor(currentDaypart);
      out.push({ orderId: order.id, kind, folded: false, ...target });
    }
  }
  return out;
}

export interface ReminderEvent {
  eventKey: "catering_driver_reminder" | "catering_driver_escalation";
  payload: {
    title: string;
    message: string;
    link: string;
    user_ids: string[];
    order_ids: string[];
    reminder_kind: ReminderKind;
    event_date: string;
  };
}

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });

function dayWords(eventDate: string, today: string): { possessive: string; phrase: string } {
  if (eventDate === today) return { possessive: "Today's", phrase: "today" };
  if (eventDate === addStoreCalendarDays(today, 1)) return { possessive: "Tomorrow's", phrase: "tomorrow" };
  const weekday = WEEKDAY.format(new Date(`${eventDate}T12:00:00.000Z`));
  return { possessive: `${weekday}'s`, phrase: weekday };
}

function orderLine(order: ReminderOrder): string {
  const clock = formatDigestClock(order.eventTime) ?? "time TBD";
  return `${neutralizeDiscordMentions(order.guestName)} ${clock} (${DELIVERY_PLATFORM_LABELS[order.platform]})`;
}

function byDeliveryTime(a: ReminderOrder, b: ReminderOrder): number {
  const at = a.eventTime?.slice(0, 5) ?? null;
  const bt = b.eventTime?.slice(0, 5) ?? null;
  if (at !== bt) {
    if (at === null) return 1;
    if (bt === null) return -1;
    return at < bt ? -1 : 1;
  }
  return a.guestName.localeCompare(b.guestName);
}

function reminderTitle(kind: ReminderKind, count: number, total: number, day: { possessive: string; phrase: string }) {
  const needs = count === 1 ? "needs" : "need";
  switch (kind) {
    case "night_ping":
    case "morning_ping":
      return `${day.possessive} deliveries: ${count} of ${total} still ${needs} a driver`;
    case "night_last_call":
    case "morning_last_call":
      return `Last call: ${count} of ${total} deliveries for ${day.phrase} still ${needs} a driver`;
    case "arrival":
      return count === 1 ? "New same-day delivery needs a driver" : `${count} new same-day deliveries need a driver`;
    case "before_60":
      return count === 1 ? "Delivery in 1 hour has no driver" : `${count} deliveries in 1 hour have no driver`;
    case "night_escalation":
      return count === 1 ? "Driver not reserved: night pass missed" : `Drivers not reserved: night pass missed (${count})`;
    case "before_30_escalation":
      return count === 1 ? "Delivery in 30 minutes has no driver" : `${count} deliveries in 30 minutes have no driver`;
  }
}

/**
 * One app_events row per (kind, delivery date, recipients): a pass lists all
 * its orders in one push. Leader reminders and escalations use separate event
 * keys so Discord routes them to different channels (catering vs leaders).
 * Messages carry the guest name as entered, the time, and the app only: never
 * a phone number or address.
 */
export function buildReminderEvents(due: DueReminder[], orders: ReminderOrder[], today: string): ReminderEvent[] {
  const byId = new Map(orders.map((order) => [order.id, order]));
  const groups = new Map<string, { kind: ReminderKind; eventDate: string; reminder: DueReminder; orders: ReminderOrder[] }>();

  for (const reminder of due) {
    if (reminder.folded) continue;
    const order = byId.get(reminder.orderId);
    if (!order) continue;
    const key = [
      reminder.kind,
      order.eventDate,
      [...reminder.recipientIds].sort().join(","),
      reminder.noLeaderDaypart ?? "",
    ].join("|");
    const group = groups.get(key) ?? { kind: reminder.kind, eventDate: order.eventDate, reminder, orders: [] };
    group.orders.push(order);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const listed = [...group.orders].sort(byDeliveryTime);
    const count = listed.length;
    const total = orders.filter((order) => order.eventDate === group.eventDate).length;
    const escalation = isEscalationKind(group.kind);

    const shown = listed.slice(0, MAX_LISTED_ORDERS).map(orderLine);
    if (listed.length > MAX_LISTED_ORDERS) shown.push(`+${listed.length - MAX_LISTED_ORDERS} more on the Drivers page`);

    const daypart = group.reminder.noLeaderDaypart;
    const noLeaderNote =
      daypart === null
        ? null
        : daypart === NO_DAYPART
          ? "No shift leader is on right now, so this came to you."
          : `No ${daypart} shift leader is posted, so this came to you.`;
    const tail = escalation
      ? group.kind === "night_escalation"
        ? "Still open after the 10 PM last call."
        : null
      : count === 1
        ? "Reserve it in Roadway or ezCater, then mark it in FIQ."
        : "Reserve them in Roadway or ezCater, then mark them in FIQ.";

    return {
      eventKey: escalation ? "catering_driver_escalation" : "catering_driver_reminder",
      payload: {
        title: reminderTitle(group.kind, count, total, dayWords(group.eventDate, today)),
        message: [noLeaderNote, `${shown.join(" · ")}.`, tail].filter(Boolean).join(" "),
        link: "/catering/drivers",
        user_ids: [...group.reminder.recipientIds],
        order_ids: listed.map((order) => order.id),
        reminder_kind: group.kind,
        event_date: group.eventDate,
      },
    };
  });
}

export interface ScorecardEscalation {
  orderId: string;
  guestName: string;
  eventDate: string;
  eventTime: string | null;
  pass: DriverPass;
  escalatedAt: string;
  /** Recipients of the last leader ping before the escalation. */
  ownerIds: string[];
}

export interface DriverScorecard {
  deliveries: number;
  escalated: number;
  /** Reserved with no escalation. A delivery never marked reserved is not on time, even unescalated. */
  onTime: number;
  /** onTime as a share of deliveries; null in a week with no deliveries. */
  onTimePct: number | null;
  byPass: Record<DriverPass, { total: number; escalated: number; onTime: number }>;
  byLeader: { leaderId: string; escalations: number }[];
  escalations: ScorecardEscalation[];
}

/** "On time" means marked reserved without an escalation. Nothing here penalizes anyone; it is for review. */
export function buildDriverScorecard(input: {
  orders: (Pick<ReminderOrder, "id" | "guestName" | "eventDate" | "eventTime" | "createdAt"> & { reserved: boolean })[];
  log: ReminderLogRow[];
}): DriverScorecard {
  const byPass: DriverScorecard["byPass"] = {
    night: { total: 0, escalated: 0, onTime: 0 },
    morning: { total: 0, escalated: 0, onTime: 0 },
    sameDay: { total: 0, escalated: 0, onTime: 0 },
  };
  const escalations: ScorecardEscalation[] = [];

  for (const order of input.orders) {
    const pass = orderPass(order);
    byPass[pass].total += 1;
    const rows = input.log
      .filter((row) => row.orderId === order.id && !row.folded)
      .sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
    const first = rows.find((row) => isEscalationKind(row.kind));
    if (!first) {
      if (order.reserved) byPass[pass].onTime += 1;
      continue;
    }
    byPass[pass].escalated += 1;
    const lastPing = rows
      .filter((row) => !isEscalationKind(row.kind) && Date.parse(row.sentAt) <= Date.parse(first.sentAt))
      .at(-1);
    escalations.push({
      orderId: order.id,
      guestName: order.guestName,
      eventDate: order.eventDate,
      eventTime: order.eventTime,
      pass,
      escalatedAt: first.sentAt,
      ownerIds: lastPing ? [...lastPing.recipientIds] : [],
    });
  }

  escalations.sort((a, b) => Date.parse(a.escalatedAt) - Date.parse(b.escalatedAt));
  const leaderCounts = new Map<string, number>();
  for (const escalation of escalations) {
    for (const id of escalation.ownerIds) leaderCounts.set(id, (leaderCounts.get(id) ?? 0) + 1);
  }
  const byLeader = [...leaderCounts.entries()]
    .map(([leaderId, count]) => ({ leaderId, escalations: count }))
    .sort((a, b) => b.escalations - a.escalations || a.leaderId.localeCompare(b.leaderId));

  const deliveries = input.orders.length;
  const onTime = byPass.night.onTime + byPass.morning.onTime + byPass.sameDay.onTime;
  return {
    deliveries,
    escalated: escalations.length,
    onTime,
    onTimePct: deliveries === 0 ? null : Math.round((onTime / deliveries) * 100),
    byPass,
    byLeader,
    escalations,
  };
}

/** Monday through Saturday; Sunday (closed) shows the week that just ended. */
export function driverWeekRange(date: string): { start: string; end: string } {
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  const start = addStoreCalendarDays(date, weekday === 0 ? -6 : 1 - weekday);
  return { start, end: addStoreCalendarDays(start, 5) };
}

/** The next day the store is open after `date` (Saturday gives Monday). */
export function nextOpenDay(date: string): string {
  const next = addStoreCalendarDays(date, 1);
  return isStoreClosedDay(next) ? addStoreCalendarDays(date, 2) : next;
}

/**
 * Dates a Drivers tab covers. "Tomorrow" is the next open day, so on Saturday
 * it shows Monday, the day the night pass is about.
 */
export function driverViewRange(view: "today" | "tomorrow" | "week", today: string): { start: string; end: string } {
  if (view === "tomorrow") {
    const day = nextOpenDay(today);
    return { start: day, end: day };
  }
  return { start: today, end: view === "week" ? addStoreCalendarDays(today, 6) : today };
}

export interface BoardOrder {
  id: string;
  guestName: string;
  eventDate: string;
  eventTime: string | null;
  headcount: number | null;
  platform: DeliveryPlatform;
  drivers: { profileId: string; name: string }[];
}

export interface BoardDay {
  date: string;
  /** "Tuesday, Oct 13" */
  label: string;
  total: number;
  reserved: number;
  /** Open orders first, then by delivery time. */
  orders: BoardOrder[];
}

const DAY_LABEL = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

export function dayLabel(date: string): string {
  return DAY_LABEL.format(new Date(`${date}T12:00:00.000Z`));
}

/** One section per delivery day, earliest first, with its "4 of 6 reserved" count. */
export function groupBoardOrders(orders: BoardOrder[]): BoardDay[] {
  const byDate = new Map<string, BoardOrder[]>();
  for (const order of orders) {
    const list = byDate.get(order.eventDate) ?? [];
    list.push(order);
    byDate.set(order.eventDate, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, list]) => {
      const sorted = [...list].sort((a, b) => {
        const openA = a.drivers.length === 0;
        const openB = b.drivers.length === 0;
        if (openA !== openB) return openA ? -1 : 1;
        const at = a.eventTime?.slice(0, 5) ?? "99:99";
        const bt = b.eventTime?.slice(0, 5) ?? "99:99";
        return at.localeCompare(bt) || a.guestName.localeCompare(b.guestName);
      });
      return {
        date,
        label: dayLabel(date),
        total: sorted.length,
        reserved: sorted.filter((order) => order.drivers.length > 0).length,
        orders: sorted,
      };
    });
}

export interface PickerDriver {
  profileId: string;
  name: string;
  carSize: CarSize;
}

/** Drivers on the delivery day's posted setups first, then by name. */
export function sortDriversForPicker<T extends PickerDriver>(
  drivers: T[],
  onSetup: ReadonlySet<string>,
): Array<T & { onSetup: boolean }> {
  return drivers
    .map((driver) => ({ ...driver, onSetup: onSetup.has(driver.profileId) }))
    .sort((a, b) => Number(b.onSetup) - Number(a.onSetup) || a.name.localeCompare(b.name));
}

/**
 * What to write so the stored drivers match the picked set. Diffing (rather
 * than delete-all-then-insert) means a repeat submit writes nothing and only
 * a newly added driver is told.
 */
export function planDriverChanges(current: string[], desired: string[]): { add: string[]; remove: string[] } {
  const have = new Set(current);
  const want = new Set(desired);
  return {
    add: [...want].filter((id) => !have.has(id)),
    remove: [...have].filter((id) => !want.has(id)),
  };
}

/** Why drivers cannot change on this order, or null. The insert policy enforces the same rule. */
export function reservationBlockedReason(order: { fulfillment: string | null; stage: string }): string | null {
  if (order.fulfillment !== "delivery") return "Only delivery orders get a driver.";
  if (!(ACTIVE_DELIVERY_STAGES as readonly string[]).includes(order.stage)) {
    return "This order is closed or cancelled, so its drivers can't change.";
  }
  return null;
}

const ASSIGNED_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** The driver's notification when they are marked reserved. */
export function driverAssignedMessage(order: {
  guestName: string;
  eventDate: string;
  eventTime: string | null;
  platform: DeliveryPlatform;
}): { title: string; message: string } {
  const date = ASSIGNED_DATE.format(new Date(`${order.eventDate}T12:00:00.000Z`));
  const clock = formatDigestClock(order.eventTime);
  const app = DELIVERY_PLATFORM_LABELS[order.platform];
  return {
    title: `You're delivering for ${order.guestName}`,
    message: `${date}${clock ? ` at ${clock}` : ""} (${app}). Make sure you're signed in to the ${app} app before you leave.`,
  };
}

export function isLargeOrder(headcount: number | null): boolean {
  return headcount !== null && headcount >= LARGE_ORDER_HEADCOUNT;
}

/** Shown once a driver is picked for a large order and none of the picks has a large car. */
export function largeOrderWarning(headcount: number | null, selectedCarSizes: CarSize[]): string | null {
  if (!isLargeOrder(headcount) || selectedCarSizes.length === 0) return null;
  if (selectedCarSizes.includes("large")) return null;
  return `Large order (${headcount} guests). Pick at least one large car.`;
}
