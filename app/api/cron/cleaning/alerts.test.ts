import { beforeEach, describe, expect, it } from "vitest";

import { loadCoordinatorIds, queueDailySummary, queuePlanReminder, queueWeekPublished } from "./alerts";

type Response = { data?: unknown; error?: { message: string } | null; count?: number };
type Call = { table: string; op: string; payload?: unknown; filters: unknown[][] };

let calls: Call[];
let queues: Record<string, Response[]>;

/**
 * Chainable stand-in for the service-role client: every filter returns the
 * builder, and awaiting it (or maybeSingle) yields the next queued response
 * for "table.op". Unqueued reads come back empty.
 */
function makeClient() {
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const respond = () => {
      const queue = queues[`${table}.${call.op}`];
      const fallback: Response = call.op === "select" ? { data: [], error: null } : { data: null, error: null };
      return Promise.resolve({ data: null, error: null, ...(queue?.shift() ?? fallback) });
    };
    const builder: Record<string, unknown> = {};
    const filter = (name: string) => (...args: unknown[]) => {
      call.filters.push([name, ...args]);
      return builder;
    };
    for (const name of ["eq", "in", "lt", "lte", "gte", "gt", "is", "or", "order", "limit", "neq"]) {
      builder[name] = filter(name);
    }
    builder.select = (...args: unknown[]) => {
      if (call.op === "select") call.filters.push(["select", ...args]);
      return builder;
    };
    for (const op of ["insert", "update", "upsert", "delete"]) {
      builder[op] = (payload?: unknown) => {
        call.op = op;
        call.payload = payload;
        return builder;
      };
    }
    builder.maybeSingle = respond;
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => respond().then(resolve, reject);
    return builder;
  };
  return { from } as never;
}

const callsOf = (table: string, op: string) => calls.filter((c) => c.table === table && c.op === op);
const TUESDAY_3AM = { today: "2026-10-27", timeOfDay: "03:05:00", now: new Date("2026-10-27T07:05:00Z") };
const ITEM_A = "11111111-1111-4111-8111-111111111111";
const ITEM_B = "22222222-2222-4222-8222-222222222222";

function claimWins() {
  queues["job_cursors.select"] = [{ data: { last_event_at: null } }];
  queues["job_cursors.update"] = [{ data: [{ job_name: "x" }] }];
}

function mondayRows(withMiss: boolean) {
  queues["cleaning_assignments.select"] = [
    {
      data: [
        { id: "a1", item_id: ITEM_A, status: "done", half: "am", rejected_at: null },
        { id: "a2", item_id: ITEM_B, status: withMiss ? "missed" : "done", half: "pm", rejected_at: null },
      ],
    },
    ...(withMiss ? [{ count: 1, data: null }] : []),
  ];
  queues["cleaning_items.select"] = [
    {
      data: [
        { id: ITEM_A, name: "Freezer", kind: "constant", zone_id: "z1" },
        { id: ITEM_B, name: "Mop sink", kind: "constant", zone_id: "z1" },
      ],
    },
  ];
  queues["cleaning_zones.select"] = [{ data: [{ id: "z1", name: "Dish to door" }] }];
}

beforeEach(() => {
  calls = [];
  queues = {};
});

describe("queueDailySummary", () => {
  it("waits for the 3am close and touches nothing before then", async () => {
    const result = await queueDailySummary(makeClient(), { ...TUESDAY_3AM, timeOfDay: "02:05:00" });
    expect(result.status).toBe("skipped");
    expect(calls).toEqual([]);
  });

  it("has nothing to say on Monday, since Sunday is closed", async () => {
    const result = await queueDailySummary(makeClient(), { ...TUESDAY_3AM, today: "2026-11-02" });
    expect(result.status).toBe("skipped");
    expect(calls).toEqual([]);
  });

  it("goes out once a day: a run that loses the claim queues nothing", async () => {
    queues["job_cursors.update"] = [{ data: [] }];
    const result = await queueDailySummary(makeClient(), TUESDAY_3AM);
    expect(result.status).toBe("already_sent");
    expect(callsOf("app_events", "insert")).toEqual([]);
  });

  it("posts to #cleaning with no person attached and notifies the coordinators of the miss", async () => {
    claimWins();
    mondayRows(true);
    queues["cleaning_coordinators.select"] = [{ data: [{ user_id: "mariana", profile: { active: true } }] }];

    const result = await queueDailySummary(makeClient(), TUESDAY_3AM);

    expect(result.status).toBe("queued");
    const [insert] = callsOf("app_events", "insert");
    const events = insert!.payload as { event_key: string; payload: Record<string, unknown> }[];
    expect(events.map((e) => e.event_key)).toEqual(["cleaning_daily_summary", "cleaning_misses"]);

    const discord = events[0]!.payload;
    expect(discord).not.toHaveProperty("user_id");
    expect(discord).not.toHaveProperty("user_ids");
    expect(discord.title).toBe("Cleaning, Mon Oct 26");
    expect(discord.message).toBe("1 of 2 done. 1 missed, 1 carried over. Missed: Mop sink (Dish to door, PM).");

    expect(events[1]!.payload).toMatchObject({ user_ids: ["mariana"], link: "/cleaning/week" });
  });

  it("skips the coordinator notice when nothing was missed", async () => {
    claimWins();
    mondayRows(false);
    await queueDailySummary(makeClient(), TUESDAY_3AM);
    const events = callsOf("app_events", "insert")[0]!.payload as { event_key: string }[];
    expect(events.map((e) => e.event_key)).toEqual(["cleaning_daily_summary"]);
    expect(callsOf("cleaning_coordinators", "select")).toEqual([]);
  });

  it("releases its claim when the insert fails, so the next hour retries", async () => {
    claimWins();
    mondayRows(false);
    queues["app_events.insert"] = [{ error: { message: "boom" } }];

    const result = await queueDailySummary(makeClient(), TUESDAY_3AM);

    expect(result).toEqual({ status: "error", error: "boom" });
    const updates = callsOf("job_cursors", "update");
    expect(updates).toHaveLength(2);
    expect(updates[1]!.payload).toMatchObject({ last_event_at: null });
    expect(updates[1]!.filters).toContainEqual(["eq", "last_event_at", TUESDAY_3AM.now.toISOString()]);
  });
});

describe("queueWeekPublished", () => {
  it("posts the week with its rotating cleans and no person attached", async () => {
    queues["cleaning_assignments.select"] = [
      {
        data: [
          { item_id: ITEM_A, date: "2026-11-03", half: "am", status: "planned" },
          { item_id: ITEM_B, date: "2026-11-02", half: "pm", status: "skipped" },
        ],
      },
    ];
    queues["cleaning_items.select"] = [{ data: [{ id: ITEM_A, name: "Rack 2", kind: "variable", zone_id: "z1" }] }];
    queues["cleaning_zones.select"] = [{ data: [{ id: "z1", name: "Prep" }] }];

    const result = await queueWeekPublished(makeClient(), "2026-11-02");

    expect(result.status).toBe("queued");
    const payload = (callsOf("app_events", "insert")[0]!.payload as { payload: Record<string, unknown> }).payload;
    expect(payload).toMatchObject({
      title: "Cleaning week of Nov 2 is live",
      message: "1 clean planned. Rotating this week: Tue AM Rack 2 (Prep).",
    });
    expect(payload).not.toHaveProperty("user_ids");
  });
});

describe("queuePlanReminder", () => {
  it("only runs Saturday from 10am", async () => {
    const friday = await queuePlanReminder(makeClient(), {
      today: "2026-10-30",
      timeOfDay: "12:00:00",
      timeZone: "America/New_York",
      now: new Date(),
    });
    expect(friday.status).toBe("skipped");
    expect(calls).toEqual([]);
  });

  it("reminds the coordinators about next week", async () => {
    claimWins();
    queues["cleaning_coordinators.select"] = [{ data: [{ user_id: "mariana", profile: { active: true } }] }];
    queues["cleaning_weeks.select"] = [{ data: { built_at: "2026-10-29T00:05:00Z" } }];
    queues["cleaning_assignments.select"] = [
      { data: [{ item_id: ITEM_A, date: "2026-11-02", half: "am", status: "planned" }] },
      { data: [] },
    ];

    const result = await queuePlanReminder(makeClient(), {
      today: "2026-10-31",
      timeOfDay: "10:05:00",
      timeZone: "America/New_York",
      now: new Date("2026-10-31T14:05:00Z"),
    });

    expect(result.status).toBe("queued");
    const event = callsOf("app_events", "insert")[0]!.payload as { event_key: string; payload: Record<string, unknown> };
    expect(event.event_key).toBe("cleaning_plan_reminder");
    expect(event.payload).toMatchObject({
      user_ids: ["mariana"],
      body: "Week of Nov 2: 1 clean planned. It goes live Monday.",
      link: "/cleaning/week?week=2026-11-02",
    });
  });
});

describe("loadCoordinatorIds", () => {
  it("uses the active tagged coordinators", async () => {
    queues["cleaning_coordinators.select"] = [
      { data: [{ user_id: "mariana", profile: { active: true } }, { user_id: "gone", profile: { active: false } }] },
    ];
    expect(await loadCoordinatorIds(makeClient())).toEqual(["mariana"]);
  });

  it("falls back to the role-level planners when nobody is tagged", async () => {
    queues["cleaning_coordinators.select"] = [{ data: [] }];
    queues["role_permissions.select"] = [{ data: [{ role_id: "lm" }] }];
    queues["profiles.select"] = [{ data: [{ id: "naldo" }] }];
    expect(await loadCoordinatorIds(makeClient())).toEqual(["naldo"]);
  });
});
