import { describe, expect, it } from "vitest";

import {
  buildDriverScorecard,
  buildReminderEvents,
  driverAssignedMessage,
  driverViewRange,
  driverWeekRange,
  groupBoardOrders,
  nextOpenDay,
  isStoreClosedDay,
  largeOrderWarning,
  nightPassDate,
  planDriverChanges,
  planDueReminders,
  RESERVE_APPS,
  RESERVE_LABELS,
  joinApps,
  reminderSlot,
  reservationBlockedReason,
  sortDriversForPicker,
  type DueReminder,
  type ReminderContext,
  type ReminderLogRow,
  type ReminderOrder,
} from "@/app/(app)/catering/drivers/logic";
import { storeDateTimeInputToIso } from "@/lib/time";

// Jasmin's memo example: Monday Oct 12 2026 is the night pass, Tuesday Oct 13
// the delivery day. October is EDT; Nov 1 2026 falls back to EST.
const MON = "2026-10-12";
const TUE = "2026-10-13";
const SAT = "2026-10-17";
const SUN = "2026-10-18";
const NEXT_MON = "2026-10-19";

function at(date: string, hhmm: string): Date {
  const iso = storeDateTimeInputToIso(`${date}T${hhmm}`);
  if (!iso) throw new Error(`bad test time ${date} ${hhmm}`);
  return new Date(iso);
}

function order(overrides: Partial<ReminderOrder> & { id: string }): ReminderOrder {
  return {
    guestName: overrides.id,
    eventDate: TUE,
    eventTime: "11:00:00",
    platform: "roadway",
    createdAt: at(MON, "15:00").toISOString(),
    reserved: false,
    ...overrides,
  };
}

const DAYPARTS = [
  { name: "Morning", start: "06:00:00", end: "11:00:00" },
  { name: "Lunch", start: "11:00:00", end: "15:00:00" },
  { name: "Mid", start: "15:00:00", end: "17:00:00" },
  { name: "Dinner", start: "17:00:00", end: "19:00:00" },
  { name: "Night", start: "19:00:00", end: "23:00:00" },
  { name: "Closing", start: "23:00:00", end: "23:45:00" },
];

function ctx(now: Date, orders: ReminderOrder[], overrides: Partial<ReminderContext> = {}): ReminderContext {
  return {
    now,
    orders,
    log: [],
    dayparts: DAYPARTS,
    leadersByDaypart: { Morning: ["deja"], Lunch: ["lunch-lead"], Night: ["night-lead"] },
    escalationContactId: "jasmin",
    ...overrides,
  };
}

function sent(o: ReminderOrder, kind: ReminderLogRow["kind"], sentAt: Date, recipientIds = ["someone"]): ReminderLogRow {
  return { orderId: o.id, kind, slot: reminderSlot(o), sentAt: sentAt.toISOString(), folded: false, recipientIds };
}

function kinds(due: DueReminder[]): string[] {
  return due.map((d) => `${d.orderId}:${d.kind}${d.folded ? ":folded" : ""}`).sort();
}

describe("store calendar", () => {
  it("treats Sunday as the only closed day", () => {
    expect(isStoreClosedDay(SUN)).toBe(true);
    expect(isStoreClosedDay(SAT)).toBe(false);
    expect(isStoreClosedDay(NEXT_MON)).toBe(false);
  });

  it("puts the night pass on the open day before delivery, so Saturday covers Monday", () => {
    expect(nightPassDate(TUE)).toBe(MON);
    expect(nightPassDate(NEXT_MON)).toBe(SAT);
    expect(nightPassDate(SAT)).toBe("2026-10-16");
  });
});

describe("planDueReminders: night pass", () => {
  it("pings the Night leader at 7 PM about tomorrow's deliveries that have no driver", () => {
    const due = planDueReminders(
      ctx(at(MON, "19:00"), [order({ id: "lisa" }), order({ id: "maria", reserved: true })]),
    );
    expect(due).toEqual([
      { orderId: "lisa", kind: "night_ping", folded: false, recipientIds: ["night-lead"], noLeaderDaypart: null },
    ]);
  });

  it("sends nothing when every delivery already has a driver", () => {
    expect(planDueReminders(ctx(at(MON, "19:00"), [order({ id: "maria", reserved: true })]))).toEqual([]);
  });

  it("does not ping before 7 PM", () => {
    expect(planDueReminders(ctx(at(MON, "18:59"), [order({ id: "lisa" })]))).toEqual([]);
  });

  it("still sends a 7 PM ping missed during downtime, until the 10 PM last call takes over", () => {
    expect(kinds(planDueReminders(ctx(at(MON, "21:30"), [order({ id: "lisa" })])))).toEqual(["lisa:night_ping"]);
    expect(kinds(planDueReminders(ctx(at(MON, "22:00"), [order({ id: "lisa" })])))).toEqual([
      "lisa:night_last_call",
    ]);
  });

  it("leaves an order that arrived after 7 PM for the 10 PM last call", () => {
    const late = order({ id: "late", createdAt: at(MON, "20:00").toISOString() });
    expect(planDueReminders(ctx(at(MON, "20:01"), [late]))).toEqual([]);
    expect(kinds(planDueReminders(ctx(at(MON, "22:00"), [late])))).toEqual(["late:night_last_call"]);
  });

  it("never repeats a reminder already in the log", () => {
    const lisa = order({ id: "lisa" });
    const log = [sent(lisa, "night_ping", at(MON, "19:00"))];
    expect(planDueReminders(ctx(at(MON, "19:05"), [lisa], { log }))).toEqual([]);
  });

  it("does not send a last call after the Night daypart ends", () => {
    expect(planDueReminders(ctx(at(MON, "23:00"), [order({ id: "lisa" })]))).toEqual([]);
  });

  it("leaves an order that arrived after 10 PM to the morning pass", () => {
    const overnight = order({ id: "kevin", createdAt: at(MON, "22:30").toISOString(), eventTime: "09:30:00" });
    expect(planDueReminders(ctx(at(MON, "22:31"), [overnight]))).toEqual([]);
    expect(kinds(planDueReminders(ctx(at(TUE, "07:00"), [overnight])))).toEqual(["kevin:morning_ping"]);
  });

  it("runs Saturday's night pass for Monday, and nothing on Sunday", () => {
    const monday = order({ id: "mon", eventDate: NEXT_MON, createdAt: at(SAT, "12:00").toISOString() });
    expect(kinds(planDueReminders(ctx(at(SAT, "19:00"), [monday])))).toEqual(["mon:night_ping"]);
    expect(planDueReminders(ctx(at(SUN, "19:00"), [monday]))).toEqual([]);
  });

  it("goes to the escalation contact, and says so, when no Night leader is posted", () => {
    const due = planDueReminders(ctx(at(MON, "19:00"), [order({ id: "lisa" })], { leadersByDaypart: {} }));
    expect(due).toEqual([
      { orderId: "lisa", kind: "night_ping", folded: false, recipientIds: ["jasmin"], noLeaderDaypart: "Night" },
    ]);
  });
});

describe("planDueReminders: go-live", () => {
  it("leaves go-live day's deliveries alone, so day one does not flood the escalation contact", () => {
    const liveFrom = at(TUE, "10:00").toISOString();
    const today = order({ id: "today", eventTime: "12:15:00" });
    expect(planDueReminders(ctx(at(TUE, "11:15"), [today], { liveFrom }))).toEqual([]);
  });

  it("covers the next day in full, even when go-live lands after 7 PM", () => {
    const liveFrom = at(MON, "20:00").toISOString();
    const lisa = order({ id: "lisa" });
    expect(kinds(planDueReminders(ctx(at(MON, "20:01"), [lisa], { liveFrom })))).toEqual(["lisa:night_ping"]);
    expect(kinds(planDueReminders(ctx(at(TUE, "06:00"), [lisa], { liveFrom })))).toEqual(["lisa:night_escalation"]);
  });

  it("still covers a same-day order that arrives after go-live", () => {
    const liveFrom = at(TUE, "10:00").toISOString();
    const rosa = order({ id: "rosa", eventTime: "12:15:00", createdAt: at(TUE, "11:00").toISOString() });
    expect(kinds(planDueReminders(ctx(at(TUE, "11:00"), [rosa], { liveFrom })))).toEqual(["rosa:arrival"]);
  });
});

describe("planDueReminders: rescheduled orders", () => {
  it("starts the reminders over when an open order moves to another day", () => {
    const tuesday = order({ id: "moved" });
    const log = [
      sent(tuesday, "night_ping", at(MON, "19:00")),
      sent(tuesday, "night_last_call", at(MON, "22:00")),
      sent(tuesday, "night_escalation", at(TUE, "06:00")),
      sent(tuesday, "morning_ping", at(TUE, "07:00")),
    ];
    const thursday = { ...tuesday, eventDate: "2026-10-15" };
    expect(kinds(planDueReminders(ctx(at("2026-10-14", "19:00"), [thursday], { log })))).toEqual(["moved:night_ping"]);
    expect(kinds(planDueReminders(ctx(at("2026-10-15", "10:30"), [thursday], { log })))).toEqual([
      "moved:before_30_escalation",
    ]);
  });

  it("starts the same-day reminders over when the time moves later", () => {
    const eleven = order({ id: "moved", eventTime: "11:00:00", createdAt: at(TUE, "09:00").toISOString() });
    const log = [sent(eleven, "arrival", at(TUE, "09:00")), sent(eleven, "before_60", at(TUE, "10:00"))];
    const two = { ...eleven, eventTime: "14:00:00" };
    // Same day, so the arrival ping is not repeated; the 60- and 30-minute
    // reminders follow the new time.
    expect(kinds(planDueReminders(ctx(at(TUE, "13:00"), [two], { log })))).toEqual(["moved:before_60"]);
    expect(kinds(planDueReminders(ctx(at(TUE, "13:30"), [two], { log: [...log, sent(two, "before_60", at(TUE, "13:00"))] })))).toEqual([
      "moved:before_30_escalation",
    ]);
  });

  it("does not repeat a pass ping when the time changes a little inside its window", () => {
    const eleven = order({ id: "nudged", eventTime: "11:00:00", createdAt: at(TUE, "01:00").toISOString() });
    const log = [sent(eleven, "morning_ping", at(TUE, "07:00")), sent(eleven, "morning_last_call", at(TUE, "08:00"))];
    const nudged = { ...eleven, eventTime: "11:05:00" };
    expect(planDueReminders(ctx(at(TUE, "08:30"), [nudged], { log }))).toEqual([]);
  });
});

describe("planDueReminders: escalations", () => {
  it("escalates at 6 AM what was still open at the 10 PM last call", () => {
    const george = order({ id: "george", eventTime: "12:15:00" });
    const kevin = order({ id: "kevin", eventTime: "09:30:00", createdAt: at(TUE, "02:00").toISOString() });
    const due = planDueReminders(ctx(at(TUE, "06:00"), [george, kevin]));
    expect(due).toEqual([
      { orderId: "george", kind: "night_escalation", folded: false, recipientIds: ["jasmin"], noLeaderDaypart: null },
    ]);
  });

  it("does not escalate before 6 AM", () => {
    expect(planDueReminders(ctx(at(TUE, "05:59"), [order({ id: "george" })]))).toEqual([]);
  });

  it("escalates 30 minutes before delivery to the escalation contact", () => {
    const rosa = order({ id: "rosa", eventTime: "12:15:00", createdAt: at(TUE, "11:00").toISOString() });
    const log = [sent(rosa, "arrival", at(TUE, "11:00")), sent(rosa, "before_60", at(TUE, "11:15"))];
    expect(planDueReminders(ctx(at(TUE, "11:45"), [rosa], { log }))).toEqual([
      { orderId: "rosa", kind: "before_30_escalation", folded: false, recipientIds: ["jasmin"], noLeaderDaypart: null },
    ]);
  });

  it("still plans an escalation with no escalation contact set, so Discord gets it", () => {
    const due = planDueReminders(ctx(at(TUE, "06:00"), [order({ id: "george" })], { escalationContactId: null }));
    expect(due).toEqual([
      { orderId: "george", kind: "night_escalation", folded: false, recipientIds: [], noLeaderDaypart: null },
    ]);
  });

  it("folds the 30-minute escalation into the 6 AM one for an early delivery", () => {
    const early = order({ id: "early", eventTime: "06:30:00" });
    expect(kinds(planDueReminders(ctx(at(TUE, "06:00"), [early])))).toEqual([
      "early:before_30_escalation:folded",
      "early:night_escalation",
    ]);
  });

  it("handles the fall-back DST change: Saturday Oct 31 covers Monday Nov 2 at 6 AM EST", () => {
    const mon = order({ id: "mon", eventDate: "2026-11-02", createdAt: at("2026-10-31", "12:00").toISOString() });
    expect(kinds(planDueReminders(ctx(at("2026-10-31", "19:00"), [mon])))).toEqual(["mon:night_ping"]);
    expect(planDueReminders(ctx(at("2026-11-02", "05:59"), [mon]))).toEqual([]);
    expect(kinds(planDueReminders(ctx(at("2026-11-02", "06:00"), [mon])))).toEqual(["mon:night_escalation"]);
  });
});

describe("planDueReminders: morning pass and same day", () => {
  it("pings the Morning leader at 7 AM and gives a last call at 8 AM", () => {
    const kevin = order({ id: "kevin", eventTime: "10:30:00", createdAt: at(TUE, "02:00").toISOString() });
    expect(planDueReminders(ctx(at(TUE, "07:00"), [kevin]))).toEqual([
      { orderId: "kevin", kind: "morning_ping", folded: false, recipientIds: ["deja"], noLeaderDaypart: null },
    ]);
    const log = [sent(kevin, "morning_ping", at(TUE, "07:00"))];
    expect(kinds(planDueReminders(ctx(at(TUE, "08:00"), [kevin], { log })))).toEqual(["kevin:morning_last_call"]);
  });

  it("folds the 60-minute ping into the 8 AM last call for a 9 AM delivery", () => {
    const nine = order({ id: "nine", eventTime: "09:00:00", createdAt: at(TUE, "01:00").toISOString() });
    const log = [sent(nine, "morning_ping", at(TUE, "07:00"))];
    const due = planDueReminders(ctx(at(TUE, "08:00"), [nine], { log }));
    expect(due).toEqual([
      { orderId: "nine", kind: "morning_last_call", folded: false, recipientIds: ["deja"], noLeaderDaypart: null },
      { orderId: "nine", kind: "before_60", folded: true, recipientIds: [], noLeaderDaypart: null },
    ]);
  });

  it("pings the leader of the daypart in progress the moment a same-day order arrives after 8 AM", () => {
    const rosa = order({ id: "rosa", eventTime: "12:15:00", createdAt: at(TUE, "11:00").toISOString() });
    expect(planDueReminders(ctx(at(TUE, "11:00"), [rosa]))).toEqual([
      { orderId: "rosa", kind: "arrival", folded: false, recipientIds: ["lunch-lead"], noLeaderDaypart: null },
    ]);
  });

  it("pings 60 minutes before delivery when the last leader ping was more than 10 minutes ago", () => {
    const rosa = order({ id: "rosa", eventTime: "12:15:00", createdAt: at(TUE, "11:00").toISOString() });
    const log = [sent(rosa, "arrival", at(TUE, "11:00"))];
    expect(planDueReminders(ctx(at(TUE, "11:15"), [rosa], { log }))).toEqual([
      { orderId: "rosa", kind: "before_60", folded: false, recipientIds: ["lunch-lead"], noLeaderDaypart: null },
    ]);
  });

  it("folds the 60-minute ping when a leader was pinged about the order in the last 10 minutes", () => {
    const rosa = order({ id: "rosa", eventTime: "12:10:00", createdAt: at(TUE, "11:08").toISOString() });
    const log = [sent(rosa, "arrival", at(TUE, "11:08"))];
    expect(kinds(planDueReminders(ctx(at(TUE, "11:10"), [rosa], { log })))).toEqual(["rosa:before_60:folded"]);
  });

  it("sends nothing once the delivery time has passed", () => {
    expect(planDueReminders(ctx(at(TUE, "11:00"), [order({ id: "lisa", eventTime: "11:00:00" })]))).toEqual([]);
  });

  it("gives an order with no delivery time the passes but not the 60 and 30 minute reminders", () => {
    const noTime = order({ id: "notime", eventTime: null, createdAt: at(TUE, "01:00").toISOString() });
    expect(kinds(planDueReminders(ctx(at(TUE, "07:00"), [noTime])))).toEqual(["notime:morning_ping"]);
    const log = [sent(noTime, "morning_ping", at(TUE, "07:00")), sent(noTime, "morning_last_call", at(TUE, "08:00"))];
    expect(planDueReminders(ctx(at(TUE, "12:00"), [noTime], { log }))).toEqual([]);
  });

  it("pings an arrival with no delivery time once", () => {
    const noTime = order({ id: "notime", eventTime: null, createdAt: at(TUE, "13:00").toISOString() });
    expect(kinds(planDueReminders(ctx(at(TUE, "13:00"), [noTime])))).toEqual(["notime:arrival"]);
  });

  it("sends a same-day ping to the escalation contact when no daypart is in progress", () => {
    const early = order({ id: "early", eventTime: "06:45:00" });
    expect(planDueReminders(ctx(at(TUE, "05:45"), [early]))).toEqual([
      { orderId: "early", kind: "before_60", folded: false, recipientIds: ["jasmin"], noLeaderDaypart: "current" },
    ]);
  });
});

describe("buildReminderEvents", () => {
  const today = TUE;

  it("lists the orders for one pass in one leader message with the day's count", () => {
    const orders = [
      order({ id: "lisa", guestName: "Lisa", eventTime: "11:00:00" }),
      order({ id: "george", guestName: "George", eventTime: "12:15:00", platform: "ezcater" }),
      order({ id: "maria", guestName: "Maria", eventTime: "10:30:00", reserved: true }),
    ];
    const due: DueReminder[] = [
      { orderId: "george", kind: "night_ping", folded: false, recipientIds: ["night-lead"], noLeaderDaypart: null },
      { orderId: "lisa", kind: "night_ping", folded: false, recipientIds: ["night-lead"], noLeaderDaypart: null },
    ];
    const events = buildReminderEvents(due, orders, MON);
    expect(events).toHaveLength(1);
    expect(events[0].eventKey).toBe("catering_driver_reminder");
    expect(events[0].payload).toMatchObject({
      title: "Tomorrow's deliveries: 2 of 3 still need a driver",
      user_ids: ["night-lead"],
      link: "/catering/drivers",
      order_ids: ["lisa", "george"],
    });
    expect(events[0].payload.message).toBe(
      "Lisa 11:00 AM (Roadway) · George 12:15 PM (ezCater + Roadway). Reserve them in the apps shown, then mark them in FIQ.",
    );
  });

  it("names the weekday when Saturday's pass covers Monday", () => {
    const mon = order({ id: "mon", guestName: "Dana", eventDate: NEXT_MON });
    const due: DueReminder[] = [
      { orderId: "mon", kind: "night_ping", folded: false, recipientIds: ["night-lead"], noLeaderDaypart: null },
    ];
    expect(buildReminderEvents(due, [mon], SAT)[0].payload.title).toBe(
      "Monday's deliveries: 1 of 1 still needs a driver",
    );
  });

  it("sends escalations under their own key so they route to the leaders channel", () => {
    const george = order({ id: "george", guestName: "George", eventTime: "12:15:00", platform: "ezcater" });
    const due: DueReminder[] = [
      { orderId: "george", kind: "night_escalation", folded: false, recipientIds: ["jasmin"], noLeaderDaypart: null },
    ];
    const [event] = buildReminderEvents(due, [george], today);
    expect(event.eventKey).toBe("catering_driver_escalation");
    expect(event.payload.title).toBe("Driver not reserved: night pass missed");
    expect(event.payload.message).toBe("George 12:15 PM (ezCater + Roadway). Still open after the 10 PM last call.");
    expect(event.payload.user_ids).toEqual(["jasmin"]);
  });

  it("says so when no shift leader was posted", () => {
    const due: DueReminder[] = [
      { orderId: "lisa", kind: "night_ping", folded: false, recipientIds: ["jasmin"], noLeaderDaypart: "Night" },
    ];
    const [event] = buildReminderEvents(due, [order({ id: "lisa", guestName: "Lisa" })], MON);
    expect(event.payload.message).toMatch(/^No Night shift leader is posted, so this came to you\. Lisa 11:00 AM/);
  });

  it("never builds a message for folded rows", () => {
    const due: DueReminder[] = [
      { orderId: "lisa", kind: "before_60", folded: true, recipientIds: [], noLeaderDaypart: null },
    ];
    expect(buildReminderEvents(due, [order({ id: "lisa" })], today)).toEqual([]);
  });

  it("keeps a typed @everyone in a guest name from pinging Discord", () => {
    const due: DueReminder[] = [
      { orderId: "x", kind: "arrival", folded: false, recipientIds: ["lunch-lead"], noLeaderDaypart: null },
    ];
    const [event] = buildReminderEvents(due, [order({ id: "x", guestName: "@everyone party" })], today);
    expect(event.payload.message).not.toContain("@everyone");
  });

  it("caps a long list and says how many more are open", () => {
    const many = Array.from({ length: 15 }, (_, i) => order({ id: `o${i}`, guestName: `Guest ${i}` }));
    const due: DueReminder[] = many.map((o) => ({
      orderId: o.id,
      kind: "night_ping",
      folded: false,
      recipientIds: ["night-lead"],
      noLeaderDaypart: null,
    }));
    const [event] = buildReminderEvents(due, many, MON);
    expect(event.payload.message).toContain("+3 more on the Drivers page");
  });
});

describe("buildDriverScorecard", () => {
  const george = order({ id: "george", guestName: "George", eventTime: "12:15:00" });
  const lisa = order({ id: "lisa", guestName: "Lisa" });
  const rosa = order({ id: "rosa", guestName: "Rosa", eventTime: "12:15:00", createdAt: at(TUE, "11:00").toISOString() });
  const kevin = order({ id: "kevin", guestName: "Kevin", createdAt: at(TUE, "02:00").toISOString() });

  it("counts escalations by pass and credits each to the leader who got the last ping before it", () => {
    const log: ReminderLogRow[] = [
      sent(george, "night_ping", at(MON, "19:00"), ["night-lead"]),
      sent(george, "night_last_call", at(MON, "22:00"), ["night-lead"]),
      sent(george, "night_escalation", at(TUE, "06:00"), ["jasmin"]),
      sent(rosa, "arrival", at(TUE, "11:00"), ["lunch-lead"]),
      sent(rosa, "before_30_escalation", at(TUE, "11:45"), ["jasmin"]),
      sent(lisa, "night_ping", at(MON, "19:00"), ["night-lead"]),
    ];
    const card = buildDriverScorecard({
      orders: [george, lisa, rosa, kevin].map((o) => ({ ...o, reserved: true })),
      log,
    });
    expect(card.deliveries).toBe(4);
    expect(card.escalated).toBe(2);
    expect(card.onTime).toBe(2);
    expect(card.onTimePct).toBe(50);
    expect(card.byPass).toEqual({
      night: { total: 2, escalated: 1, onTime: 1 },
      morning: { total: 1, escalated: 0, onTime: 1 },
      sameDay: { total: 1, escalated: 1, onTime: 0 },
    });
    expect(card.escalations.map((e) => [e.orderId, e.pass, e.ownerIds])).toEqual([
      ["george", "night", ["night-lead"]],
      ["rosa", "sameDay", ["lunch-lead"]],
    ]);
    expect(card.byLeader).toEqual([
      { leaderId: "lunch-lead", escalations: 1 },
      { leaderId: "night-lead", escalations: 1 },
    ]);
  });

  it("does not count a delivery that was never marked reserved as on time, even with no escalation", () => {
    const card = buildDriverScorecard({ orders: [{ ...lisa, reserved: false }, { ...kevin, reserved: true }], log: [] });
    expect(card.onTime).toBe(1);
    expect(card.onTimePct).toBe(50);
  });

  it("has no on-time rate in a week with no deliveries", () => {
    expect(buildDriverScorecard({ orders: [], log: [] }).onTimePct).toBeNull();
  });
});

describe("driverWeekRange", () => {
  it("runs Monday to Saturday, and Sunday shows the week just ended", () => {
    expect(driverWeekRange(TUE)).toEqual({ start: MON, end: SAT });
    expect(driverWeekRange(SUN)).toEqual({ start: MON, end: SAT });
    expect(driverWeekRange(NEXT_MON)).toEqual({ start: NEXT_MON, end: "2026-10-24" });
  });
});

describe("Drivers page helpers", () => {
  it("makes Tomorrow the next open day, so Saturday shows Monday", () => {
    expect(nextOpenDay(TUE)).toBe("2026-10-14");
    expect(nextOpenDay(SAT)).toBe(NEXT_MON);
    expect(driverViewRange("tomorrow", SAT)).toEqual({ start: NEXT_MON, end: NEXT_MON });
    expect(driverViewRange("today", TUE)).toEqual({ start: TUE, end: TUE });
    expect(driverViewRange("week", TUE)).toEqual({ start: TUE, end: "2026-10-19" });
  });

  it("groups by day with open orders first and a reserved count", () => {
    const base = { headcount: 20, platform: "roadway" as const };
    const days = groupBoardOrders([
      { ...base, id: "lisa", guestName: "Lisa", eventDate: TUE, eventTime: "11:00:00", drivers: [{ profileId: "m", name: "Messiah" }] },
      { ...base, id: "george", guestName: "George", eventDate: TUE, eventTime: "12:15:00", drivers: [] },
      { ...base, id: "kevin", guestName: "Kevin", eventDate: TUE, eventTime: "09:30:00", drivers: [] },
      { ...base, id: "dana", guestName: "Dana", eventDate: MON, eventTime: null, drivers: [] },
    ]);
    expect(days.map((d) => [d.date, d.label, d.reserved, d.total])).toEqual([
      [MON, "Monday, Oct 12", 0, 1],
      [TUE, "Tuesday, Oct 13", 1, 3],
    ]);
    expect(days[1].orders.map((o) => o.id)).toEqual(["kevin", "george", "lisa"]);
  });
});

describe("which apps a driver is reserved in", () => {
  it("puts an ezCater order in ezCater and Roadway, and a Roadway order in Roadway only", () => {
    expect(RESERVE_APPS.ezcater).toEqual(["ezCater", "Roadway"]);
    expect(RESERVE_APPS.roadway).toEqual(["Roadway"]);
    expect(RESERVE_LABELS.ezcater).toBe("ezCater + Roadway");
    expect(joinApps(RESERVE_APPS.ezcater)).toBe("ezCater and Roadway");
    expect(joinApps(RESERVE_APPS.roadway)).toBe("Roadway");
  });
});

describe("reservation helpers", () => {
  it("diffs the picked drivers against the stored ones", () => {
    expect(planDriverChanges(["m", "j"], ["m", "a"])).toEqual({ add: ["a"], remove: ["j"] });
    expect(planDriverChanges(["m"], ["m"])).toEqual({ add: [], remove: [] });
    expect(planDriverChanges(["m"], [])).toEqual({ add: [], remove: ["m"] });
  });

  it("only lets drivers change on open delivery orders", () => {
    expect(reservationBlockedReason({ fulfillment: "delivery", stage: "confirm" })).toBeNull();
    expect(reservationBlockedReason({ fulfillment: "pickup", stage: "confirm" })).toBe("Only delivery orders get a driver.");
    expect(reservationBlockedReason({ fulfillment: null, stage: "new" })).toBe("Only delivery orders get a driver.");
    expect(reservationBlockedReason({ fulfillment: "delivery", stage: "closed" })).toMatch(/closed or cancelled/);
    expect(reservationBlockedReason({ fulfillment: "delivery", stage: "cancelled" })).toMatch(/closed or cancelled/);
  });

  it("tells the driver which order, when, and which app to be signed in to", () => {
    expect(
      driverAssignedMessage({ guestName: "Lisa", eventDate: TUE, eventTime: "11:00:00", platform: "roadway" }),
    ).toEqual({
      title: "You're delivering for Lisa",
      message: "Tue, Oct 13 at 11:00 AM (Roadway). Make sure you're signed in to the Roadway app before you leave.",
    });
    expect(
      driverAssignedMessage({ guestName: "George", eventDate: TUE, eventTime: null, platform: "ezcater" }).message,
    ).toBe("Tue, Oct 13 (ezCater + Roadway). Make sure you're signed in to the ezCater and Roadway apps before you leave.");
  });
});

describe("picker helpers", () => {
  it("lists drivers on the day's setup first, then by name", () => {
    const drivers = [
      { profileId: "a", name: "Ari", carSize: "large" as const },
      { profileId: "j", name: "Jordan", carSize: "small" as const },
      { profileId: "m", name: "Messiah", carSize: "large" as const },
    ];
    expect(sortDriversForPicker(drivers, new Set(["m", "j"])).map((d) => [d.profileId, d.onSetup])).toEqual([
      ["j", true],
      ["m", true],
      ["a", false],
    ]);
  });

  it("warns when a large order has no large car picked", () => {
    expect(largeOrderWarning(45, ["small"])).toBe("Large order (45 guests). Pick at least one large car.");
    expect(largeOrderWarning(45, ["small", "large"])).toBeNull();
    expect(largeOrderWarning(45, [])).toBeNull();
    expect(largeOrderWarning(20, ["small"])).toBeNull();
    expect(largeOrderWarning(null, ["small"])).toBeNull();
  });
});
