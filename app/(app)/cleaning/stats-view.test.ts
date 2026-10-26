import { describe, expect, it } from "vitest";

import { leaderStats, trendPoints, type StatRow } from "@/app/(app)/cleaning/stats";
import {
  areaRows,
  barHeight,
  emptyMonthText,
  leaderIds,
  leaderRows,
  monthChipLabel,
  monthChips,
  overdueRows,
  parseMonthParam,
  pctText,
  pctTone,
  rangeNote,
  scoredRange,
  toStatRows,
  trendBars,
  unownedView,
} from "@/app/(app)/cleaning/stats-view";

const TODAY = "2026-10-29";

describe("parseMonthParam", () => {
  it("defaults to the current month when the param is missing", () => {
    expect(parseMonthParam(undefined, TODAY)).toBe("2026-10");
    expect(parseMonthParam("", TODAY)).toBe("2026-10");
  });

  it("accepts a well-formed month up to and including the current one", () => {
    expect(parseMonthParam("2026-09", TODAY)).toBe("2026-09");
    expect(parseMonthParam("2026-10", TODAY)).toBe("2026-10");
    expect(parseMonthParam("2025-12", TODAY)).toBe("2025-12");
  });

  it("falls back on a malformed value instead of failing", () => {
    for (const bad of ["2026-13", "2026-00", "2026-9", "26-09", "2026/09", "october", "2026-09-01", "2026-09 "]) {
      expect(parseMonthParam(bad, TODAY), bad).toBe("2026-10");
    }
  });

  it("falls back on a future month and on one older than the app", () => {
    expect(parseMonthParam("2026-11", TODAY)).toBe("2026-10");
    expect(parseMonthParam("2027-01", TODAY)).toBe("2026-10");
    expect(parseMonthParam("0000-01", TODAY)).toBe("2026-10");
    expect(parseMonthParam("2019-12", TODAY)).toBe("2026-10");
  });

  it("takes the store's today, so January still reaches back into the old year", () => {
    expect(parseMonthParam("2026-12", "2027-01-05")).toBe("2026-12");
  });
});

describe("scoredRange", () => {
  it("stops the current month at yesterday so today's open cleans are not scored", () => {
    expect(scoredRange("2026-10", TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-28" });
  });

  it("covers a past month in full, leap February included", () => {
    expect(scoredRange("2026-09", TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(scoredRange("2028-02", "2028-03-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("has nothing to score on the first of the month", () => {
    expect(scoredRange("2026-11", "2026-11-01")).toBeNull();
  });

  it("scores through the 1st on the 2nd", () => {
    expect(scoredRange("2026-11", "2026-11-02")).toEqual({ from: "2026-11-01", to: "2026-11-01" });
  });

  it("has no range for a month that has not started", () => {
    expect(scoredRange("2026-11", TODAY)).toBeNull();
  });

  it("caps on the store's date at a year boundary", () => {
    expect(scoredRange("2027-01", "2027-01-01")).toBeNull();
    expect(scoredRange("2026-12", "2027-01-01")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});

describe("rangeNote and emptyMonthText", () => {
  it("says how far the current month is scored, and only for the current month", () => {
    expect(rangeNote("2026-10", TODAY)).toBe("Scored through Wed Oct 28. Today's cleans count once the day has closed.");
    expect(rangeNote("2026-09", TODAY)).toBeNull();
    expect(rangeNote("2026-11", "2026-11-01")).toBeNull();
  });

  it("explains an empty current month differently from an empty past month", () => {
    expect(emptyMonthText("2026-10", TODAY)).toMatch(/yet this month/);
    expect(emptyMonthText("2026-09", TODAY)).toBe("No cleans were recorded in September 2026.");
  });
});

describe("monthChips", () => {
  it("offers this month and the five before it, newest first, with the selected one lit", () => {
    const chips = monthChips(TODAY, "2026-09");
    expect(chips.map((c) => c.month)).toEqual(["2026-10", "2026-09", "2026-08", "2026-07", "2026-06", "2026-05"]);
    expect(chips.filter((c) => c.active).map((c) => c.month)).toEqual(["2026-09"]);
    expect(chips[0]).toEqual({ month: "2026-10", label: "Oct 2026", href: "/cleaning/stats?month=2026-10", active: false });
  });

  it("adds a typed-in older month at the end so a chip is always lit", () => {
    const chips = monthChips(TODAY, "2025-01");
    expect(chips).toHaveLength(7);
    expect(chips.at(-1)).toMatchObject({ month: "2025-01", active: true });
  });

  it("shortens month names to three letters", () => {
    expect(monthChipLabel("2026-05")).toBe("May 2026");
    expect(monthChipLabel("2026-09")).toBe("Sep 2026");
  });
});

describe("pctText and pctTone", () => {
  it("shows a dash, not 0%, when nothing has closed", () => {
    expect(pctText(null)).toBe("-");
    expect(pctText(0)).toBe("0%");
    expect(pctText(92)).toBe("92%");
  });

  it("is green from the plan's 90% bar, amber from 70%, red below, neutral without data", () => {
    expect(pctTone(100)).toBe("success");
    expect(pctTone(90)).toBe("success");
    expect(pctTone(89)).toBe("warning");
    expect(pctTone(70)).toBe("warning");
    expect(pctTone(69)).toBe("danger");
    expect(pctTone(0)).toBe("danger");
    expect(pctTone(null)).toBe("neutral");
  });
});

describe("trend bars", () => {
  it("sizes a bar by its percent, with a floor so a 0% week is still visible", () => {
    expect(barHeight(92)).toBe(92);
    expect(barHeight(100)).toBe(100);
    expect(barHeight(0)).toBe(4);
    expect(barHeight(2)).toBe(4);
    expect(barHeight(null)).toBe(0);
    expect(barHeight(140)).toBe(100);
  });

  it("builds one labeled bar per week from the function rows, oldest first as given", () => {
    const bars = trendBars(
      trendPoints([
        { week_start: "2026-10-12", owed: 40, on_time: 30, missed: 6 },
        { week_start: "2026-10-19", owed: 36, on_time: 36, missed: 0 },
        { week_start: "2026-10-26", owed: 0, on_time: 0, missed: 0 },
      ]),
    );
    expect(bars.map((b) => [b.label, b.pctText, b.heightPct, b.tone])).toEqual([
      ["Oct 12", "75%", 75, "warning"],
      ["Oct 19", "100%", 100, "success"],
      ["Oct 26", "-", 0, "neutral"],
    ]);
    expect(bars[0]!.summary).toBe("Week of Oct 12: 75% on time, 6 missed");
    expect(bars[2]!.summary).toBe("Week of Oct 26: nothing closed yet");
  });

  it("is empty when the store has no history", () => {
    expect(trendBars([])).toEqual([]);
  });
});

let seq = 0;
function stat(over: Partial<StatRow>): StatRow {
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
    completed_at: "2026-10-27T14:00:00Z",
    rejected_at: null,
    ...over,
  };
}

describe("toStatRows", () => {
  it("keeps exactly the columns the counting reads", () => {
    const [row] = toStatRows([
      {
        id: "a",
        item_id: "i",
        date: "2026-10-27",
        half: "pm",
        status: "missed",
        origin: "auto",
        carried_from_id: null,
        owner_user_id: "u1",
        completed_at: null,
        rejected_at: null,
      },
    ]);
    expect(row).toEqual({
      id: "a",
      item_id: "i",
      date: "2026-10-27",
      half: "pm",
      status: "missed",
      origin: "auto",
      carried_from_id: null,
      owner_user_id: "u1",
      completed_at: null,
      rejected_at: null,
    });
  });
});

describe("leaderIds", () => {
  it("names the owner stamped on a miss, else the posted Setup leader, and skips ownerless days", () => {
    const rows = [
      stat({ status: "missed", completed_at: null, owner_user_id: "stamped" }),
      stat({ date: "2026-10-28", half: "pm" }),
      stat({ date: "2026-10-29", half: "am" }),
      stat({ date: "2026-10-27", half: "am", status: "missed", completed_at: null, owner_user_id: "stamped" }),
    ];
    const owners = new Map([
      ["2026-10-28|pm", "closer"],
      ["2026-10-30|am", "not-in-rows"],
    ]);
    expect(leaderIds(rows, owners).sort()).toEqual(["closer", "stamped"]);
  });
});

describe("leaderRows and unownedView", () => {
  const TZ = "America/New_York";

  it("keeps the name order from leaderStats and adds no rank", () => {
    // Done cleans are credited from the posted Setups; a miss from its stamp.
    const owners = new Map([
      ["2026-10-26|am", "u-zed"],
      ["2026-10-27|am", "u-amy"],
    ]);
    const rows = [
      stat({ date: "2026-10-26", completed_at: "2026-10-26T14:00:00Z" }),
      stat({ owner_user_id: "u-amy", status: "missed", completed_at: null }),
      stat({}),
    ];
    const { leaders } = leaderStats(rows, owners, new Map([["u-zed", "Zed"], ["u-amy", "Amy"]]), TZ);
    const view = leaderRows(leaders);
    expect(view.map((l) => l.name)).toEqual(["Amy", "Zed"]);
    expect(view[0]).toEqual({
      userId: "u-amy",
      name: "Amy",
      pctText: "50%",
      tone: "danger",
      owned: 2,
      missed: 1,
      carriedOver: 0,
    });
    expect(Object.keys(view[0]!)).not.toContain("rank");
  });

  it("shows a dash for a leader whose cleans have not closed", () => {
    const rows = [stat({ status: "planned", completed_at: null })];
    const { leaders } = leaderStats(rows, new Map([["2026-10-27|am", "u1"]]), new Map([["u1", "Amy"]]), TZ);
    expect(leaderRows(leaders)[0]).toMatchObject({ pctText: "-", tone: "neutral", owned: 1 });
  });

  it("shows the No Setup posted bucket only when it holds cleans", () => {
    const empty = leaderStats([stat({})], new Map([["2026-10-27|am", "u1"]]), new Map([["u1", "Amy"]]), TZ);
    expect(unownedView(empty.unowned)).toBeNull();

    const withBucket = leaderStats(
      [stat({}), stat({ status: "missed", completed_at: null })],
      new Map(),
      new Map(),
      TZ,
    );
    expect(unownedView(withBucket.unowned)).toEqual({ owed: 2, missed: 1, pctText: "50%", tone: "danger" });
  });
});

describe("areaRows", () => {
  it("keeps the order and color it is given and formats the percent", () => {
    const rows = areaRows([
      { zoneId: "z1", name: "Boards", color: "#16A34A", owed: 10, onTime: 9, late: 0, missed: 1, sentBack: 0, pct: 90 },
      { zoneId: "z2", name: "Dumpster", color: "#1D4ED8", owed: 3, onTime: 0, late: 0, missed: 0, sentBack: 0, pct: null },
    ]);
    expect(rows).toEqual([
      { zoneId: "z1", name: "Boards", color: "#16A34A", pctText: "90%", tone: "success", owed: 10, missed: 1 },
      { zoneId: "z2", name: "Dumpster", color: "#1D4ED8", pctText: "-", tone: "neutral", owed: 3, missed: 0 },
    ]);
  });
});

describe("overdueRows", () => {
  it("links to the item and counts days, singular for one", () => {
    const rows = overdueRows([
      { id: "i1", name: "Vent above boards", zoneName: "Boards", nextDue: "2026-10-17", daysOverdue: 12, lastDone: "2026-10-03" },
      { id: "i2", name: "Mop sink", zoneName: "Dish to door", nextDue: "2026-10-28", daysOverdue: 1, lastDone: "2026-10-14" },
    ]);
    expect(rows[0]).toEqual({
      id: "i1",
      name: "Vent above boards",
      zoneName: "Boards",
      href: "/cleaning/items/i1",
      badge: "12 days overdue",
      lastText: "Last cleaned Sat Oct 3",
    });
    expect(rows[1]!.badge).toBe("1 day overdue");
  });

  it("says never cleaned when there is no due date at all, without saying it twice", () => {
    const [row] = overdueRows([
      { id: "i3", name: "Fry vents", zoneName: "Machines", nextDue: null, daysOverdue: null, lastDone: null },
    ]);
    expect(row).toMatchObject({ badge: "Never cleaned", lastText: null });
  });

  it("shows a never-cleaned item with a start date as overdue and never cleaned", () => {
    const [row] = overdueRows([
      { id: "i4", name: "Freezer", zoneName: "Prep", nextDue: "2026-10-20", daysOverdue: 9, lastDone: null },
    ]);
    expect(row).toMatchObject({ badge: "9 days overdue", lastText: "Never cleaned" });
  });
});
