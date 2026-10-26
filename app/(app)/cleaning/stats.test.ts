import { describe, expect, it } from "vitest";

import {
  leaderStats,
  monthBounds,
  monthLabel,
  mostOverdue,
  outcome,
  previousMonth,
  tally,
  trendPoints,
  zoneStats,
  type StatRow,
} from "@/app/(app)/cleaning/stats";

const TZ = "America/New_York";
const TODAY = "2026-10-29";

let seq = 0;
function row(over: Partial<StatRow>): StatRow {
  seq += 1;
  return {
    id: `r${seq}`,
    item_id: "i1",
    date: "2026-10-27",
    half: "am",
    status: "done",
    origin: "constant",
    carried_from_id: null,
    owner_user_id: null,
    // 10am New York on the 27th.
    completed_at: "2026-10-27T14:00:00Z",
    rejected_at: null,
    ...over,
  };
}

describe("outcome", () => {
  it("is on time when done on or before its day, store-local", () => {
    expect(outcome(row({}), TZ)).toBe("on_time");
    // Done Monday for a Tuesday clean: early counts.
    expect(outcome(row({ completed_at: "2026-10-26T14:00:00Z" }), TZ)).toBe("on_time");
    // 11:30pm New York on the 27th is already the 28th in UTC; still on time.
    expect(outcome(row({ completed_at: "2026-10-28T03:30:00Z" }), TZ)).toBe("on_time");
  });

  it("is late when finished after midnight, before the 3am close", () => {
    expect(outcome(row({ completed_at: "2026-10-28T05:30:00Z" }), TZ)).toBe("late");
  });

  it("is not owed when skipped or sent back for a redo", () => {
    expect(outcome(row({ status: "skipped", completed_at: null }), TZ)).toBe("not_owed");
    expect(outcome(row({ rejected_at: "2026-10-27T20:00:00Z" }), TZ)).toBe("not_owed");
  });

  it("counts a miss and leaves an open clean out of the score", () => {
    expect(outcome(row({ status: "missed", completed_at: null }), TZ)).toBe("missed");
    expect(outcome(row({ status: "planned", completed_at: null, date: TODAY }), TZ)).toBe("open");
  });
});

describe("tally", () => {
  it("scores on time over closed cleans only", () => {
    expect(tally(["on_time", "on_time", "late", "missed", "open", "not_owed"])).toEqual({
      owed: 5,
      onTime: 2,
      late: 1,
      missed: 1,
      pct: 50,
    });
  });

  it("has no score before anything closed", () => {
    expect(tally(["open"]).pct).toBeNull();
    expect(tally([]).pct).toBeNull();
  });
});

describe("months", () => {
  it("bounds a month, including February and a leap year", () => {
    expect(monthBounds("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthBounds("2027-02")).toEqual({ from: "2027-02-01", to: "2027-02-28" });
    expect(monthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("steps back across a year and names the month", () => {
    expect(previousMonth("2027-01")).toBe("2026-12");
    expect(monthLabel("2026-10")).toBe("October 2026");
  });
});

describe("leaderStats", () => {
  const owners = new Map([
    ["2026-10-27|am", "ana"],
    ["2026-10-27|pm", "ben"],
  ]);
  const names = new Map([
    ["ana", "Ana Ruiz"],
    ["ben", "Ben Cole"],
  ]);

  it("credits each clean to that half's Setup leader, sorted by name, not by score", () => {
    const miss = row({ id: "m1", half: "pm", status: "missed", completed_at: null, owner_user_id: "ben" });
    const rows = [
      row({ half: "am" }),
      row({ half: "am", status: "missed", completed_at: null, owner_user_id: "ana" }),
      miss,
      row({ id: "c1", date: "2026-10-28", half: "pm", origin: "carry_over", carried_from_id: "m1", status: "planned", completed_at: null }),
    ];
    const result = leaderStats(rows, owners, names, TZ);
    expect(result.leaders.map((l) => [l.name, l.owed, l.onTime, l.missed, l.carriedOver, l.pct])).toEqual([
      ["Ana Ruiz", 2, 1, 1, 0, 50],
      ["Ben Cole", 1, 0, 1, 1, 0],
    ]);
  });

  it("counts a carry-over that landed after the period, once", () => {
    const miss = row({ id: "last", date: "2026-10-31", half: "pm", status: "missed", completed_at: null, owner_user_id: "ben" });
    const result = leaderStats([miss], owners, names, TZ, [{ carried_from_id: "last" }, { carried_from_id: "last" }]);
    expect(result.leaders[0]).toMatchObject({ name: "Ben Cole", missed: 1, carriedOver: 1 });
  });

  it("keeps the owner stamped on a miss even if the Setup changed later", () => {
    const rows = [row({ status: "missed", completed_at: null, owner_user_id: "ben" })];
    const result = leaderStats(rows, owners, names, TZ);
    expect(result.leaders.map((l) => l.name)).toEqual(["Ben Cole"]);
  });

  it("puts cleans on a day with no posted Setup in their own bucket", () => {
    const result = leaderStats(
      [row({ date: "2026-10-26", completed_at: "2026-10-26T14:00:00Z" })],
      owners,
      names,
      TZ,
    );
    expect(result.leaders).toEqual([]);
    expect(result.unowned).toMatchObject({ owed: 1, onTime: 1 });
  });
});

describe("zoneStats", () => {
  it("tallies by area in zone order, skipping areas with nothing owed", () => {
    const zones = [
      { id: "z1", name: "Boards", color: "#16A34A", sort: 1 },
      { id: "z2", name: "Prep", color: "#16A34A", sort: 2 },
      { id: "z3", name: "Patio", color: "#EA6A0C", sort: 11 },
    ];
    const itemZone = new Map([
      ["i1", "z2"],
      ["i2", "z1"],
    ]);
    const rows = [row({ item_id: "i1" }), row({ item_id: "i2", status: "missed", completed_at: null })];
    expect(zoneStats(rows, itemZone, zones, TZ).map((z) => [z.name, z.owed, z.pct])).toEqual([
      ["Boards", 1, 0],
      ["Prep", 1, 100],
    ]);
  });
});

describe("trendPoints", () => {
  it("labels each week and scores it", () => {
    expect(
      trendPoints([
        { week_start: "2026-10-19", owed: 0, on_time: 0, missed: 0 },
        { week_start: "2026-10-26", owed: 40, on_time: 34, missed: 4 },
      ]),
    ).toEqual([
      { weekStart: "2026-10-19", label: "Oct 19", owed: 0, onTime: 0, missed: 0, pct: null },
      { weekStart: "2026-10-26", label: "Oct 26", owed: 40, onTime: 34, missed: 4, pct: 85 },
    ]);
  });
});

describe("mostOverdue", () => {
  const items = [
    { id: "v1", name: "Hood filters", zoneName: "Machines", kind: "variable" as const, interval_weeks: 4, start_on: "2026-09-01" },
    { id: "v2", name: "Rack 2", zoneName: "Prep", kind: "variable" as const, interval_weeks: 2, start_on: "2026-10-01" },
    { id: "v3", name: "Patio rail", zoneName: "Patio", kind: "variable" as const, interval_weeks: 8, start_on: "2026-11-30" },
    { id: "c1", name: "Mop sink", zoneName: "Dish to door", kind: "constant" as const, interval_weeks: null, start_on: null },
  ];

  it("lists overdue rotating cleans, most days overdue first", () => {
    const lastDone = new Map([["v2", "2026-10-01"]]);
    expect(mostOverdue(items, lastDone, TODAY)).toEqual([
      { id: "v1", name: "Hood filters", zoneName: "Machines", nextDue: "2026-09-01", daysOverdue: 58, lastDone: null },
      { id: "v2", name: "Rack 2", zoneName: "Prep", nextDue: "2026-10-15", daysOverdue: 14, lastDone: "2026-10-01" },
    ]);
  });

  it("caps the list", () => {
    expect(mostOverdue(items, new Map(), TODAY, 1)).toHaveLength(1);
  });
});
