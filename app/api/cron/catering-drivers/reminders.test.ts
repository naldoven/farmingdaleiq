import { beforeEach, describe, expect, it } from "vitest";

import { storeDateTimeInputToIso } from "@/lib/time";

import { runDriverReminders } from "./reminders";

type Response = { data: unknown; error: { message: string } | null };

const MON = "2026-10-12";
const TUE = "2026-10-13";

function at(date: string, hhmm: string): Date {
  return new Date(storeDateTimeInputToIso(`${date}T${hhmm}`)!);
}

let orders: Response;
let orderDrivers: Response;
let reminderLog: Response;
let setups: Response;
let settings: Response;
/** Which of the upserted rows this run "wins"; default: all of them. */
let claimFilter: (row: Record<string, unknown>) => boolean;
let eventInsertError: { message: string } | null;

let upserted: Array<Record<string, unknown>>;
let upsertOptions: unknown;
let insertedEvents: Array<Record<string, unknown>>;
let deletes: Array<Array<[string, unknown]>>;
let settingsUpdates: Array<{ values: Record<string, unknown>; filters: Array<[string, unknown]> }>;
let orderFilters: Array<[string, unknown]>;

function chain(response: () => Response, filters: Array<[string, unknown]> = []) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "not", "is"]) {
    query[method] = (...args: unknown[]) => {
      if (method !== "select") filters.push([String(args[0]), args.length > 2 ? args.slice(1) : args[1]]);
      return query;
    };
  }
  query.maybeSingle = () => Promise.resolve(response());
  query.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(response()).then(resolve, reject);
  return query;
}

const DAYPARTS = [
  { id: "dp-morning", name: "Morning", start_time: "06:00:00", end_time: "11:00:00" },
  { id: "dp-lunch", name: "Lunch", start_time: "11:00:00", end_time: "15:00:00" },
  { id: "dp-night", name: "Night", start_time: "19:00:00", end_time: "23:00:00" },
];

function fakeAdmin() {
  return {
    from(table: string) {
      switch (table) {
        case "catering_orders":
          return chain(() => orders, orderFilters);
        case "catering_order_drivers":
          return chain(() => orderDrivers);
        case "day_parts":
          return chain(() => ({ data: DAYPARTS, error: null }));
        case "setups":
          return chain(() => setups);
        case "catering_driver_settings":
          return {
            ...chain(() => settings),
            update(values: Record<string, unknown>) {
              const filters: Array<[string, unknown]> = [];
              settingsUpdates.push({ values, filters });
              return chain(() => ({ data: values, error: null }), filters);
            },
          };
        case "catering_driver_reminders":
          return {
            ...chain(() => reminderLog),
            upsert(rows: Array<Record<string, unknown>>, options: unknown) {
              upserted.push(...rows);
              upsertOptions = options;
              return {
                select: () =>
                  Promise.resolve({
                    data: rows.filter(claimFilter).map((row) => ({ order_id: row.order_id, kind: row.kind })),
                    error: null,
                  }),
              };
            },
            delete() {
              const filters: Array<[string, unknown]> = [];
              deletes.push(filters);
              return chain(() => ({ data: null, error: null }), filters);
            },
          };
        case "app_events":
          return {
            insert(rows: Array<Record<string, unknown>>) {
              insertedEvents.push(...rows);
              return Promise.resolve({ error: eventInsertError });
            },
          };
        default:
          throw new Error(`Unexpected table ${table}`);
      }
    },
  } as unknown as Parameters<typeof runDriverReminders>[0];
}

function orderRow(id: string, fields: Record<string, unknown> = {}) {
  return {
    id,
    guest_name: id,
    event_date: TUE,
    event_time: "11:00:00",
    delivery_platform: "roadway",
    created_at: at(MON, "15:00").toISOString(),
    ...fields,
  };
}

beforeEach(() => {
  orders = { data: [orderRow("Lisa"), orderRow("George", { event_time: "12:15:00", delivery_platform: "ezcater" })], error: null };
  orderDrivers = { data: [], error: null };
  reminderLog = { data: [], error: null };
  setups = { data: [{ day_part_id: "dp-night", shift_leader_id: "night-lead" }], error: null };
  settings = { data: { escalation_profile_id: "jasmin", reminders_live_from: "2026-10-01T04:00:00.000Z" }, error: null };
  settingsUpdates = [];
  claimFilter = () => true;
  eventInsertError = null;
  upserted = [];
  upsertOptions = undefined;
  insertedEvents = [];
  deletes = [];
  orderFilters = [];
});

describe("runDriverReminders", () => {
  it("does nothing when there are no delivery orders in play", async () => {
    orders = { data: [], error: null };
    expect(await runDriverReminders(fakeAdmin(), at(MON, "19:00"))).toEqual({ status: "idle" });
    expect(insertedEvents).toEqual([]);
  });

  it("only loads active delivery orders for today through the day after tomorrow", async () => {
    await runDriverReminders(fakeAdmin(), at(MON, "19:00"));
    expect(orderFilters).toEqual([
      ["fulfillment", "delivery"],
      ["stage", ["new", "confirm", "setup", "out"]],
      ["event_date", [MON, TUE, "2026-10-14"]],
    ]);
  });

  it("claims each reminder, then queues one message for the night pass to the posted Night leader", async () => {
    const result = await runDriverReminders(fakeAdmin(), at(MON, "19:00"));
    expect(result).toEqual({ status: "sent", claimed: 2, events: 1 });
    expect(upsertOptions).toEqual({ onConflict: "order_id,kind,slot", ignoreDuplicates: true });
    expect(upserted.map((row) => [row.order_id, row.kind, row.slot, row.recipient_ids, row.folded])).toEqual([
      ["Lisa", "night_ping", "2026-10-13 11:00", ["night-lead"], false],
      ["George", "night_ping", "2026-10-13 12:15", ["night-lead"], false],
    ]);
    expect(insertedEvents).toHaveLength(1);
    expect(insertedEvents[0].event_key).toBe("catering_driver_reminder");
    expect(insertedEvents[0].payload).toMatchObject({
      title: "Tomorrow's deliveries: 2 of 2 still need a driver",
      user_ids: ["night-lead"],
    });
  });

  it("skips orders that already have a driver", async () => {
    orderDrivers = { data: [{ order_id: "Lisa" }], error: null };
    await runDriverReminders(fakeAdmin(), at(MON, "19:00"));
    expect(upserted.map((row) => row.order_id)).toEqual(["George"]);
  });

  it("sends only what its own claim won when another run got there first", async () => {
    claimFilter = (row) => row.order_id === "George";
    const result = await runDriverReminders(fakeAdmin(), at(MON, "19:00"));
    expect(result).toEqual({ status: "sent", claimed: 1, events: 1 });
    expect((insertedEvents[0].payload as { order_ids: string[] }).order_ids).toEqual(["George"]);
  });

  it("sends nothing when every claim was already taken", async () => {
    claimFilter = () => false;
    expect(await runDriverReminders(fakeAdmin(), at(MON, "19:00"))).toEqual({ status: "sent", claimed: 0, events: 0 });
    expect(insertedEvents).toEqual([]);
  });

  it("does not resend what the log already has", async () => {
    reminderLog = {
      data: [
        { order_id: "Lisa", kind: "night_ping", slot: "2026-10-13 11:00", sent_at: at(MON, "19:00").toISOString(), folded: false, recipient_ids: [] },
        { order_id: "George", kind: "night_ping", slot: "2026-10-13 12:15", sent_at: at(MON, "19:00").toISOString(), folded: false, recipient_ids: [] },
      ],
      error: null,
    };
    expect(await runDriverReminders(fakeAdmin(), at(MON, "19:01"))).toEqual({ status: "idle" });
  });

  it("releases its claims when the message cannot be queued, so the next minute retries", async () => {
    eventInsertError = { message: "insert failed" };
    const now = at(MON, "19:00");
    const result = await runDriverReminders(fakeAdmin(), now);
    expect(result).toEqual({ status: "error", error: "insert failed" });
    expect(deletes).toEqual([[["sent_at", now.toISOString()], ["order_id", ["Lisa", "George"]]]]);
  });

  it("sends escalations under the escalation key to the escalation contact", async () => {
    const result = await runDriverReminders(fakeAdmin(), at(TUE, "06:00"));
    expect(result.status).toBe("sent");
    expect(insertedEvents.map((event) => event.event_key)).toEqual(["catering_driver_escalation"]);
    expect((insertedEvents[0].payload as { user_ids: string[] }).user_ids).toEqual(["jasmin"]);
  });

  it("goes to the escalation contact when no Night setup is posted", async () => {
    setups = { data: [], error: null };
    await runDriverReminders(fakeAdmin(), at(MON, "19:00"));
    expect((insertedEvents[0].payload as { user_ids: string[]; message: string }).user_ids).toEqual(["jasmin"]);
    expect((insertedEvents[0].payload as { message: string }).message).toMatch(/^No Night shift leader is posted/);
  });

  it("records a folded reminder without sending anything for it", async () => {
    orders = {
      data: [orderRow("Nine", { event_time: "09:00:00", created_at: at(TUE, "01:00").toISOString() })],
      error: null,
    };
    reminderLog = {
      data: [{ order_id: "Nine", kind: "morning_ping", slot: "2026-10-13 09:00", sent_at: at(TUE, "07:00").toISOString(), folded: false, recipient_ids: [] }],
      error: null,
    };
    setups = { data: [{ day_part_id: "dp-morning", shift_leader_id: "deja" }], error: null };
    const result = await runDriverReminders(fakeAdmin(), at(TUE, "08:00"));
    expect(upserted.map((row) => [row.kind, row.folded])).toEqual([
      ["morning_last_call", false],
      ["before_60", true],
    ]);
    expect(result).toEqual({ status: "sent", claimed: 2, events: 1 });
  });

  it("honors the go-live stamp, so day one does not escalate orders reserved before FIQ knew about them", async () => {
    settings = { data: { escalation_profile_id: "jasmin", reminders_live_from: at(TUE, "05:00").toISOString() }, error: null };
    expect(await runDriverReminders(fakeAdmin(), at(TUE, "06:00"))).toEqual({ status: "idle" });
    expect(insertedEvents).toEqual([]);
  });

  it("resends for a new slot when an order is moved", async () => {
    reminderLog = {
      data: [
        { order_id: "Lisa", kind: "night_ping", slot: "2026-10-12 11:00", sent_at: at(MON, "08:00").toISOString(), folded: false, recipient_ids: [] },
      ],
      error: null,
    };
    orders = { data: [orderRow("Lisa")], error: null };
    await runDriverReminders(fakeAdmin(), at(MON, "19:00"));
    expect(upserted.map((row) => [row.kind, row.slot])).toEqual([["night_ping", "2026-10-13 11:00"]]);
  });

  it("stamps the go-live instant on its first run and leaves that day's deliveries alone", async () => {
    settings = { data: { escalation_profile_id: "jasmin", reminders_live_from: null }, error: null };
    orders = { data: [orderRow("Lisa", { event_date: MON, created_at: at(MON, "06:00").toISOString() })], error: null };
    const now = at(MON, "10:00");
    expect(await runDriverReminders(fakeAdmin(), now)).toEqual({ status: "idle" });
    expect(settingsUpdates).toEqual([
      { values: { reminders_live_from: now.toISOString() }, filters: [["id", true], ["reminders_live_from", null]] },
    ]);
  });

  it("does not stamp again once go-live is set", async () => {
    await runDriverReminders(fakeAdmin(), at(MON, "19:00"));
    expect(settingsUpdates).toEqual([]);
  });

  it("reports a failed read instead of sending", async () => {
    setups = { data: null, error: { message: "setups down" } };
    expect(await runDriverReminders(fakeAdmin(), at(MON, "19:00"))).toEqual({ status: "error", error: "setups down" });
    expect(upserted).toEqual([]);
  });
});
