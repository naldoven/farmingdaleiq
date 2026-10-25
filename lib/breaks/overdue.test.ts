import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cron sweep coverage (lib/breaks/overdue.ts). The 'missed' sweep is final
 * (missed is a terminal status) and fans out to the leaders channel, so a
 * false positive cannot be taken back. These tests pin the two rules that
 * keep it honest:
 *   1. A break is missed only after the LATER of the person's scheduled_end
 *      and the day-part end, and never before its own due time.
 *   2. Only setups dated today or yesterday (store time) are swept.
 */

const SETUP_ID = "22222222-2222-4222-8222-222222222222";
const OLD_SETUP_ID = "22222222-2222-4222-8222-222222222299";
const USER_A = "33333333-3333-4333-8333-333333333333";
const DAY_PART_ID = "55555555-5555-4555-8555-555555555555";
const RULE_ID = "66666666-6666-4666-8666-666666666666";
const BREAK_ID = "11111111-1111-4111-8111-111111111111";
const OLD_BREAK_ID = "11111111-1111-4111-8111-111111111199";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

interface Call {
  table: string;
  op: "select" | "update";
  payload?: unknown;
  filters: [string, ...unknown[]][];
}

/**
 * Tiny in-memory PostgREST stand-in: filters really filter, and an update
 * really mutates the stored rows and returns them (so the sweep's
 * compare-and-swap `.eq("status", ...)` behaves like the database).
 */
function createFakeClient(db: Db, calls: Call[]) {
  return {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      const predicates: ((row: Row) => boolean)[] = [];
      let updatePayload: Row | null = null;
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.update = (payload: Row) => {
        call.op = "update";
        call.payload = payload;
        updatePayload = payload;
        return builder;
      };
      builder.eq = (col: string, val: unknown) => {
        call.filters.push(["eq", col, val]);
        predicates.push((row) => row[col] === val);
        return builder;
      };
      builder.in = (col: string, vals: unknown[]) => {
        call.filters.push(["in", col, vals]);
        predicates.push((row) => vals.includes(row[col]));
        return builder;
      };
      builder.not = (col: string, op: string, val: unknown) => {
        call.filters.push(["not", col, op, val]);
        if (op === "is" && val === null) predicates.push((row) => row[col] != null);
        return builder;
      };
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        const matching = (db[table] ?? []).filter((row) => predicates.every((p) => p(row)));
        if (updatePayload) for (const row of matching) Object.assign(row, updatePayload);
        return Promise.resolve({ data: matching.map((r) => ({ ...r })), error: null }).then(resolve, reject);
      };
      return builder;
    },
  };
}

let db: Db;
let calls: Call[];
const emitEventMock = vi.fn(async (key: string, payload: unknown) => {
  void key;
  void payload;
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events/bus", () => ({
  emitEvent: (key: string, payload: unknown) => emitEventMock(key, payload),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => createFakeClient(db, calls),
}));

import { markOverdueBreaks } from "./overdue";
import { storeDateTimeInputToIso } from "@/lib/time";

/** A store wall-clock time as an ISO instant. */
function at(time: string, date = "2026-07-07"): string {
  const iso = storeDateTimeInputToIso(`${date}T${time}`);
  if (!iso) throw new Error(`bad test time ${date}T${time}`);
  return iso;
}

function setNow(time: string, date = "2026-07-07") {
  vi.setSystemTime(new Date(at(time, date)));
}

function breakRow(overrides: Row = {}): Row {
  return {
    id: BREAK_ID,
    status: "pending",
    setup_id: SETUP_ID,
    user_id: USER_A,
    rule_id: RULE_ID,
    authorized_at: null,
    ...overrides,
  };
}

/**
 * The example from the review: Morning runs 06:00 to 11:00, an adult works
 * 06:00 to 14:00, so the 6-hour break is due at 12:00.
 */
function seedMorningAdult(assignment: Row | null = { arrival: "06:00", scheduledEnd: "14:00" }) {
  db = {
    setups: [{ id: SETUP_ID, date: "2026-07-07", day_part_id: DAY_PART_ID }],
    day_parts: [{ id: DAY_PART_ID, end_time: "11:00:00" }],
    break_rules: [{ id: RULE_ID, min_shift_minutes: 360 }],
    setup_assignments: assignment
      ? [
          {
            setup_id: SETUP_ID,
            user_id: USER_A,
            arrival_time: at(assignment.arrival as string),
            scheduled_end: assignment.scheduledEnd ? at(assignment.scheduledEnd as string) : null,
          },
        ]
      : [],
    breaks: [breakRow()],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  emitEventMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("markOverdueBreaks: missed sweep cutoff", () => {
  it("does not mark a 06:00-14:00 adult's break missed at the 11:05 tick (Morning ends 11:00, break due 12:00)", async () => {
    seedMorningAdult();
    setNow("11:05");

    const result = await markOverdueBreaks();

    expect(result).toEqual({ flagged: 0, missed: 0 });
    expect(db.breaks[0].status).toBe("pending");
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it("stays open through the due time and flips only after the scheduled end, once", async () => {
    seedMorningAdult();

    setNow("12:05"); // past due, shift still running
    expect((await markOverdueBreaks()).missed).toBe(0);
    expect(db.breaks[0].status).toBe("pending");

    setNow("14:05"); // scheduled end has passed
    expect((await markOverdueBreaks()).missed).toBe(1);
    expect(db.breaks[0].status).toBe("missed");
    expect(emitEventMock).toHaveBeenCalledTimes(1);
    expect(emitEventMock).toHaveBeenCalledWith("break_overdue", {
      break_id: BREAK_ID,
      setup_id: SETUP_ID,
      user_id: USER_A,
      status: "missed",
    });

    setNow("14:10"); // next tick must not re-emit
    expect((await markOverdueBreaks()).missed).toBe(0);
    expect(emitEventMock).toHaveBeenCalledTimes(1);
  });

  it("never marks a break missed before its own due time, even if the scheduled end was edited earlier", async () => {
    seedMorningAdult({ arrival: "06:00", scheduledEnd: "11:30" }); // due 12:00

    setNow("11:45");
    expect((await markOverdueBreaks()).missed).toBe(0);

    setNow("12:05");
    expect((await markOverdueBreaks()).missed).toBe(1);
    expect(db.breaks[0].status).toBe("missed");
  });

  it("keeps the day-part-end behavior when there is no assignment data to measure from", async () => {
    seedMorningAdult(null);

    setNow("10:55");
    expect((await markOverdueBreaks()).missed).toBe(0);

    setNow("11:05");
    expect((await markOverdueBreaks()).missed).toBe(1);
    expect(db.breaks[0].status).toBe("missed");
  });

  it("leaves a setup with no day-part alone", async () => {
    seedMorningAdult();
    (db.setups[0] as Row).day_part_id = null;
    setNow("23:00");

    expect((await markOverdueBreaks()).missed).toBe(0);
    expect(db.breaks[0].status).toBe("pending");
  });
});

describe("markOverdueBreaks: missed sweep date limit", () => {
  it("skips a setup posted for an older date and only queries today and yesterday", async () => {
    seedMorningAdult(null);
    db.setups.push({ id: OLD_SETUP_ID, date: "2026-07-03", day_part_id: DAY_PART_ID });
    db.breaks.push(breakRow({ id: OLD_BREAK_ID, setup_id: OLD_SETUP_ID }));
    setNow("11:05");

    const result = await markOverdueBreaks();

    expect(result.missed).toBe(1); // today's only
    expect(db.breaks.find((b) => b.id === BREAK_ID)?.status).toBe("missed");
    expect(db.breaks.find((b) => b.id === OLD_BREAK_ID)?.status).toBe("pending");
    expect(emitEventMock).toHaveBeenCalledTimes(1);

    const setupQuery = calls.find((c) => c.table === "setups");
    expect(setupQuery?.filters).toContainEqual(["in", "date", ["2026-07-06", "2026-07-07"]]);
  });

  it("still sweeps yesterday's setup (a late shift or missed tick can leave a break open past midnight)", async () => {
    seedMorningAdult(null);
    (db.setups[0] as Row).date = "2026-07-06";
    db.setup_assignments = [];
    setNow("00:30"); // 2026-07-07 in store time, yesterday's 11:00 end long gone

    expect((await markOverdueBreaks()).missed).toBe(1);
    expect(db.breaks[0].status).toBe("missed");
  });

  it("uses the store calendar day, not the server's UTC day", async () => {
    seedMorningAdult(null);
    (db.setups[0] as Row).date = "2026-07-06";
    db.setup_assignments = [];
    // 23:30 on 2026-07-07 in New York is already 2026-07-08 in UTC. A UTC
    // "today" would be 07-08 and drop 07-06 out of the window.
    setNow("23:30");

    expect((await markOverdueBreaks()).missed).toBe(1);
    expect(db.breaks[0].status).toBe("missed");
  });
});
