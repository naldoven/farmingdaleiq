import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The planner actions on the weekly board (week-actions.ts). The Supabase
 * client is a recording fake: each case queues what a table returns and then
 * checks what was asked of it, because the filters ARE the safety here (a
 * status filter is what makes a double tap harmless, the origin filter is what
 * keeps a constant from being removed).
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/permissions", () => ({
  PermissionError: class PermissionError extends Error {},
}));

const state = vi.hoisted(() => ({ planner: true, today: "2026-10-28" }));

vi.mock("@/app/(app)/cleaning/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/(app)/cleaning/queries")>();
  const { PermissionError } = await import("@/lib/auth/permissions");
  return {
    ...actual,
    requireCleaningPlanner: async () => {
      if (!state.planner) throw new (PermissionError as unknown as new (key: string) => Error)("cleaning.plan");
    },
    loadStoreClock: async () => ({ today: state.today, timeOfDay: "09:00:00", timeZone: "America/New_York" }),
  };
});

type Op = "select" | "insert" | "update" | "delete" | "upsert";
interface Response {
  data?: unknown;
  error?: { message: string; code?: string } | null;
}
interface Call {
  table: string;
  op: Op;
  payload?: unknown;
  options?: unknown;
  filters: [string, ...unknown[]][];
}

let client: ReturnType<typeof makeClient>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));

/** Queue per "table.op"; an unqueued call returns no data and no error. */
function makeClient(queues: Record<string, Response[]> = {}) {
  const calls: Call[] = [];
  const from = (table: string) => {
    let op: Op | null = null;
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const set = (next: Op, payload?: unknown, options?: unknown) => {
      op = next;
      call.op = next;
      call.payload = payload;
      call.options = options;
      return builder;
    };
    const filter =
      (name: string) =>
      (...args: unknown[]) => {
        call.filters.push([name, ...args]);
        return builder;
      };
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (payload: unknown) => set("insert", payload),
      update: (payload: unknown) => set("update", payload),
      delete: () => set("delete"),
      upsert: (payload: unknown, options: unknown) => set("upsert", payload, options),
      eq: filter("eq"),
      neq: filter("neq"),
      gte: filter("gte"),
      maybeSingle: () => builder,
      then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
        const queue = queues[`${table}.${op ?? "select"}`];
        const response = queue?.shift() ?? {};
        return Promise.resolve({ data: null, error: null, ...response }).then(resolve, reject);
      },
    };
    return builder;
  };
  return { from, calls };
}

const ID = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const OK = { ok: true, data: undefined };

import { addClean, moveClean, removeClean, skipClean, unskipClean } from "@/app/(app)/cleaning/week-actions";

const callsOf = (table: string, op: Op) => client.calls.filter((c) => c.table === table && c.op === op);

beforeEach(() => {
  state.planner = true;
  state.today = "2026-10-28"; // a Wednesday
  client = makeClient();
});

describe("every action runs the planner guard before touching the database", () => {
  it("refuses a non-planner without a single query", async () => {
    state.planner = false;
    const results = await Promise.all([
      moveClean({ id: ID, date: "2026-10-29", half: "am" }),
      skipClean({ id: ID, reason: "Busy" }),
      unskipClean({ id: ID }),
      removeClean({ id: ID }),
      addClean({ itemId: ITEM, date: "2026-10-29", half: "am" }),
    ]);
    for (const result of results) expect(result).toEqual({ ok: false, error: "You don't have permission to do this." });
    expect(client.calls).toEqual([]);
  });
});

describe("moveClean", () => {
  const planned = { data: { week_start: "2026-10-26", status: "planned" } };

  it("moves a planned clean, guarding the update on status planned", async () => {
    client = makeClient({ "cleaning_assignments.select": [planned], "cleaning_assignments.update": [{ data: [{ id: ID }] }] });
    expect(await moveClean({ id: ID, date: "2026-10-30", half: "pm" })).toEqual(OK);
    const [update] = callsOf("cleaning_assignments", "update");
    expect(update!.payload).toEqual({ date: "2026-10-30", half: "pm" });
    expect(update!.filters).toEqual([
      ["eq", "id", ID],
      ["eq", "status", "planned"],
    ]);
  });

  it("refuses a clean that is not planned", async () => {
    client = makeClient({ "cleaning_assignments.select": [{ data: { week_start: "2026-10-26", status: "done" } }] });
    const result = await moveClean({ id: ID, date: "2026-10-30", half: "am" });
    expect(result).toEqual({ ok: false, error: "Only a planned clean can be moved." });
    expect(callsOf("cleaning_assignments", "update")).toEqual([]);
  });

  it("refuses a day outside the clean's own week", async () => {
    client = makeClient({ "cleaning_assignments.select": [planned, planned] });
    for (const date of ["2026-10-24", "2026-11-02"]) {
      const result = await moveClean({ id: ID, date, half: "am" });
      expect(result).toEqual({ ok: false, error: "Pick a day in the same week." });
    }
    expect(callsOf("cleaning_assignments", "update")).toEqual([]);
  });

  it("accepts the week's first and last days", async () => {
    state.today = "2026-10-26";
    client = makeClient({
      "cleaning_assignments.select": [planned, planned],
      "cleaning_assignments.update": [{ data: [{ id: ID }] }, { data: [{ id: ID }] }],
    });
    expect(await moveClean({ id: ID, date: "2026-10-26", half: "am" })).toEqual(OK);
    expect(await moveClean({ id: ID, date: "2026-10-31", half: "pm" })).toEqual(OK);
  });

  it("refuses a day that already passed, which would close out as a miss", async () => {
    client = makeClient({ "cleaning_assignments.select": [planned] });
    const result = await moveClean({ id: ID, date: "2026-10-27", half: "am" });
    expect(result).toEqual({ ok: false, error: "That day has already passed." });
    expect(callsOf("cleaning_assignments", "update")).toEqual([]);
  });

  it("allows today", async () => {
    client = makeClient({ "cleaning_assignments.select": [planned], "cleaning_assignments.update": [{ data: [{ id: ID }] }] });
    expect(await moveClean({ id: ID, date: "2026-10-28", half: "pm" })).toEqual(OK);
  });

  it("turns a unique violation into a friendly message", async () => {
    client = makeClient({
      "cleaning_assignments.select": [planned],
      "cleaning_assignments.update": [{ error: { message: "duplicate key value", code: "23505" } }],
    });
    const result = await moveClean({ id: ID, date: "2026-10-30", half: "am" });
    expect(result).toEqual({ ok: false, error: "That item is already in that slot." });
  });

  it("says so when the clean changed under the planner (the status filter matched nothing)", async () => {
    client = makeClient({ "cleaning_assignments.select": [planned], "cleaning_assignments.update": [{ data: [] }] });
    const result = await moveClean({ id: ID, date: "2026-10-30", half: "am" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("changed");
  });

  it("reports a clean that is gone", async () => {
    client = makeClient({ "cleaning_assignments.select": [{ data: null }] });
    const result = await moveClean({ id: ID, date: "2026-10-30", half: "am" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("no longer on the board");
  });

  it("rejects Sunday and a malformed id before any query", async () => {
    const sunday = await moveClean({ id: ID, date: "2026-11-01", half: "am" });
    expect(sunday).toEqual({ ok: false, error: "The store is closed Sunday." });
    const badId = await moveClean({ id: "nope", date: "2026-10-30", half: "am" });
    expect(badId.ok).toBe(false);
    expect(client.calls).toEqual([]);
  });
});

describe("skipClean", () => {
  it("skips a planned clean from today on, with the reason", async () => {
    client = makeClient({ "cleaning_assignments.update": [{ data: [{ id: ID }] }] });
    expect(await skipClean({ id: ID, reason: "  Walk-in being serviced  " })).toEqual(OK);
    const [update] = callsOf("cleaning_assignments", "update");
    expect(update!.payload).toEqual({ status: "skipped", skip_reason: "Walk-in being serviced" });
    expect(update!.filters).toEqual([
      ["eq", "id", ID],
      ["eq", "status", "planned"],
      ["gte", "date", "2026-10-28"],
    ]);
  });

  it("requires a reason and caps it at 200 characters", async () => {
    const empty = await skipClean({ id: ID, reason: "   " });
    expect(empty).toEqual({ ok: false, error: "Give a reason for skipping." });
    const long = await skipClean({ id: ID, reason: "x".repeat(201) });
    expect(long.ok).toBe(false);
    expect(client.calls).toEqual([]);
  });

  it("treats a double tap as success: the clean is already skipped", async () => {
    client = makeClient({
      "cleaning_assignments.update": [{ data: [] }],
      "cleaning_assignments.select": [{ data: { status: "skipped", origin: "auto" } }],
    });
    expect(await skipClean({ id: ID, reason: "Busy" })).toEqual(OK);
  });

  it("refuses a clean that is already done", async () => {
    client = makeClient({
      "cleaning_assignments.update": [{ data: [] }],
      "cleaning_assignments.select": [{ data: { status: "done", origin: "auto" } }],
    });
    expect(await skipClean({ id: ID, reason: "Busy" })).toEqual({ ok: false, error: "Only a planned clean can be skipped." });
  });

  it("refuses a past day, so a planner cannot hide a miss", async () => {
    client = makeClient({
      "cleaning_assignments.update": [{ data: [] }],
      "cleaning_assignments.select": [{ data: { status: "planned", origin: "auto" } }],
    });
    const result = await skipClean({ id: ID, reason: "Busy" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("already passed");
  });
});

describe("unskipClean", () => {
  it("puts a skipped clean back to planned and clears the reason", async () => {
    client = makeClient({ "cleaning_assignments.update": [{ data: [{ id: ID }] }] });
    expect(await unskipClean({ id: ID })).toEqual(OK);
    const [update] = callsOf("cleaning_assignments", "update");
    expect(update!.payload).toEqual({ status: "planned", skip_reason: null });
    expect(update!.filters).toEqual([
      ["eq", "id", ID],
      ["eq", "status", "skipped"],
      ["gte", "date", "2026-10-28"],
    ]);
  });

  it("treats a double tap as success: the clean is already planned", async () => {
    client = makeClient({
      "cleaning_assignments.update": [{ data: [] }],
      "cleaning_assignments.select": [{ data: { status: "planned", origin: "auto" } }],
    });
    expect(await unskipClean({ id: ID })).toEqual(OK);
  });

  it("refuses to revive a clean that is done", async () => {
    client = makeClient({
      "cleaning_assignments.update": [{ data: [] }],
      "cleaning_assignments.select": [{ data: { status: "done", origin: "auto" } }],
    });
    const result = await unskipClean({ id: ID });
    expect(result).toEqual({ ok: false, error: "Only a skipped clean can be put back." });
  });
});

describe("removeClean", () => {
  it("deletes only a planned clean that is not a constant", async () => {
    client = makeClient({ "cleaning_assignments.delete": [{ data: [{ id: ID }] }] });
    expect(await removeClean({ id: ID })).toEqual(OK);
    const [del] = callsOf("cleaning_assignments", "delete");
    expect(del!.filters).toEqual([
      ["eq", "id", ID],
      ["eq", "status", "planned"],
      ["neq", "origin", "constant"],
    ]);
  });

  it("explains that a constant is skipped, not removed", async () => {
    client = makeClient({
      "cleaning_assignments.delete": [{ data: [] }],
      "cleaning_assignments.select": [{ data: { status: "planned", origin: "constant" } }],
    });
    expect(await removeClean({ id: ID })).toEqual({
      ok: false,
      error: "A constant can't be removed. Skip it instead.",
    });
  });

  it("keeps the record of a clean that is no longer planned", async () => {
    client = makeClient({
      "cleaning_assignments.delete": [{ data: [] }],
      "cleaning_assignments.select": [{ data: { status: "done", origin: "manual" } }],
    });
    expect(await removeClean({ id: ID })).toEqual({ ok: false, error: "Only a planned clean can be removed." });
  });

  it("treats a double tap as success: the clean is already gone", async () => {
    client = makeClient({
      "cleaning_assignments.delete": [{ data: [] }],
      "cleaning_assignments.select": [{ data: null }],
    });
    expect(await removeClean({ id: ID })).toEqual(OK);
  });
});

describe("addClean", () => {
  const activeItem = { data: { id: ITEM, status: "active", zone: { active: true } } };

  it("makes sure the week exists, then inserts a manual clean in that week", async () => {
    client = makeClient({ "cleaning_items.select": [activeItem] });
    // 2026-11-03 is a Tuesday, so its week starts Monday 2026-11-02.
    expect(await addClean({ itemId: ITEM, date: "2026-11-03", half: "pm" })).toEqual(OK);

    const [week] = callsOf("cleaning_weeks", "upsert");
    expect(week!.payload).toEqual({ week_start: "2026-11-02" });
    expect(week!.options).toEqual({ onConflict: "week_start", ignoreDuplicates: true });

    const [insert] = callsOf("cleaning_assignments", "insert");
    expect(insert!.payload).toEqual({
      week_start: "2026-11-02",
      item_id: ITEM,
      date: "2026-11-03",
      half: "pm",
      origin: "manual",
    });
  });

  it("refuses an item that is a draft or retired, before writing anything", async () => {
    for (const status of ["draft", "retired"]) {
      client = makeClient({ "cleaning_items.select": [{ data: { id: ITEM, status, zone: { active: true } } }] });
      const result = await addClean({ itemId: ITEM, date: "2026-10-29", half: "am" });
      expect(result).toEqual({ ok: false, error: "That item isn't on the active list." });
      expect(callsOf("cleaning_weeks", "upsert")).toEqual([]);
      expect(callsOf("cleaning_assignments", "insert")).toEqual([]);
    }
  });

  it("refuses an item in a hidden zone, so FOH stays out of a BOH week", async () => {
    client = makeClient({ "cleaning_items.select": [{ data: { id: ITEM, status: "active", zone: { active: false } } }] });
    const result = await addClean({ itemId: ITEM, date: "2026-10-29", half: "am" });
    expect(result.ok).toBe(false);
    expect(callsOf("cleaning_assignments", "insert")).toEqual([]);
  });

  it("refuses an item that does not exist", async () => {
    client = makeClient({ "cleaning_items.select": [{ data: null }] });
    const result = await addClean({ itemId: ITEM, date: "2026-10-29", half: "am" });
    expect(result.ok).toBe(false);
  });

  it("refuses a day that already passed", async () => {
    const result = await addClean({ itemId: ITEM, date: "2026-10-27", half: "am" });
    expect(result).toEqual({ ok: false, error: "That day has already passed." });
    expect(client.calls).toEqual([]);
  });

  it("turns a unique violation into a friendly message", async () => {
    client = makeClient({
      "cleaning_items.select": [activeItem],
      "cleaning_assignments.insert": [{ error: { message: "duplicate key value", code: "23505" } }],
    });
    const result = await addClean({ itemId: ITEM, date: "2026-10-29", half: "am" });
    expect(result).toEqual({ ok: false, error: "That item is already in that slot." });
  });

  it("rejects Sunday and a malformed item id before any query", async () => {
    const sunday = await addClean({ itemId: ITEM, date: "2026-11-01", half: "am" });
    expect(sunday).toEqual({ ok: false, error: "The store is closed Sunday." });
    const badId = await addClean({ itemId: "nope", date: "2026-10-29", half: "am" });
    expect(badId.ok).toBe(false);
    expect(client.calls).toEqual([]);
  });
});
