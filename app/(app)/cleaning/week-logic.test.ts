import { describe, expect, it } from "vitest";

import {
  addDays,
  boardWeekStart,
  currentHalf,
  dueNotPlaced,
  dueState,
  isoWeekday,
  lastDoneDates,
  nextDueDate,
  nextOpenDay,
  planWeek,
  projectLastDone,
  redoSlot,
  weekSlots,
  type PlanInput,
  type PlanItem,
} from "@/app/(app)/cleaning/week-logic";

// 2026-10-26 is a Monday; 2026-11-01 is the Sunday DST ends in New York.
const MON = "2026-10-26";

function constant(id: string, days: number[], half: "am" | "pm", sort = 0): PlanItem {
  return { id, name: id, kind: "constant", days_of_week: days, half, interval_weeks: null, start_on: null, sort };
}

function variable(id: string, interval: number, half: "am" | "pm" | "either" = "either", sort = 0): PlanItem {
  return { id, name: id, kind: "variable", days_of_week: null, half, interval_weeks: interval, start_on: null, sort };
}

function caps(value: number): Map<string, number> {
  const map = new Map<string, number>();
  for (let d = 1; d <= 6; d += 1) {
    map.set(`${d}|am`, value);
    map.set(`${d}|pm`, value);
  }
  return map;
}

function input(over: Partial<PlanInput>): PlanInput {
  return { weekStart: MON, fromDate: MON, items: [], caps: caps(2), lastDone: new Map(), existing: [], ...over };
}

describe("dates", () => {
  it("adds days across the DST change without drifting", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("numbers weekdays Monday 1 to Sunday 7", () => {
    expect(isoWeekday(MON)).toBe(1);
    expect(isoWeekday("2026-10-31")).toBe(6);
    expect(isoWeekday("2026-11-01")).toBe(7);
  });

  it("skips Sunday: Saturday's next open day is Monday", () => {
    expect(nextOpenDay("2026-10-30")).toBe("2026-10-31");
    expect(nextOpenDay("2026-10-31")).toBe("2026-11-02");
  });

  it("puts Sunday in the coming week, since the store is closed", () => {
    expect(boardWeekStart("2026-10-28")).toBe(MON);
    expect(boardWeekStart("2026-10-31")).toBe(MON);
    expect(boardWeekStart("2026-11-01")).toBe("2026-11-02");
  });

  it("lists Mon AM to Sat PM, dropping days before fromDate", () => {
    const all = weekSlots(MON, MON);
    expect(all).toHaveLength(12);
    expect(all[0]).toEqual({ date: MON, weekday: 1, half: "am" });
    expect(all[11]).toEqual({ date: "2026-10-31", weekday: 6, half: "pm" });
    expect(weekSlots(MON, "2026-10-29")).toHaveLength(6);
    expect(weekSlots(MON, "2026-11-02")).toHaveLength(0);
  });

  it("splits the day at 2pm store time", () => {
    expect(currentHalf("09:00:00")).toBe("am");
    expect(currentHalf("13:59:59")).toBe("am");
    expect(currentHalf("14:00:00")).toBe("pm");
  });

  it("sends a redo to the next shift", () => {
    expect(redoSlot(MON, "am")).toEqual({ date: MON, half: "pm" });
    expect(redoSlot(MON, "pm")).toEqual({ date: "2026-10-27", half: "am" });
    expect(redoSlot("2026-10-31", "pm")).toEqual({ date: "2026-11-02", half: "am" });
    expect(redoSlot("2026-11-01", "am")).toEqual({ date: "2026-11-02", half: "am" });
  });

  it("reads last-done timestamps as store-local dates", () => {
    // 01:30 UTC on Oct 27 is still Oct 26 in New York.
    const map = lastDoneDates([{ item_id: "a", last_done_at: "2026-10-27T01:30:00Z" }], "America/New_York");
    expect(map.get("a")).toBe(MON);
  });
});

describe("nextDueDate", () => {
  it("is the last clean plus the interval", () => {
    expect(nextDueDate(1, "2026-10-21", null)).toBe("2026-10-28");
    expect(nextDueDate(13, "2026-10-21", null)).toBe("2027-01-20");
  });

  it("uses the start date when never cleaned", () => {
    expect(nextDueDate(4, null, "2026-11-04")).toBe("2026-11-04");
  });

  it("is null (due now) when never cleaned and no start date", () => {
    expect(nextDueDate(4, null, null)).toBeNull();
  });
});

describe("dueState", () => {
  it("colors the master list dot", () => {
    expect(dueState(null, MON, "2026-10-31")).toBe("overdue");
    expect(dueState("2026-10-20", MON, "2026-10-31")).toBe("overdue");
    expect(dueState(MON, MON, "2026-10-31")).toBe("due_this_week");
    expect(dueState("2026-10-31", MON, "2026-10-31")).toBe("due_this_week");
    expect(dueState("2026-11-02", MON, "2026-10-31")).toBe("not_due");
  });
});

describe("planWeek", () => {
  it("lands constants on their days and half", () => {
    const { inserts } = planWeek(input({ items: [constant("mop", [1, 4], "pm")] }));
    expect(inserts).toEqual([
      { item_id: "mop", date: MON, half: "pm", origin: "constant" },
      { item_id: "mop", date: "2026-10-29", half: "pm", origin: "constant" },
    ]);
  });

  it("never places anything before fromDate, so a mid-week build cannot create instant misses", () => {
    const { inserts } = planWeek(input({ fromDate: "2026-10-28", items: [constant("mop", [1, 4], "pm")] }));
    expect(inserts.map((i) => i.date)).toEqual(["2026-10-29"]);
  });

  it("is a no-op when rerun over its own output", () => {
    const items = [constant("mop", [1], "am"), variable("vent", 4)];
    const first = planWeek(input({ items }));
    const existing = first.inserts.map((i) => ({
      item_id: i.item_id,
      date: i.date,
      half: i.half,
      status: "planned" as const,
      itemKind: items.find((it) => it.id === i.item_id)!.kind,
    }));
    const second = planWeek(input({ items, existing }));
    expect(second.inserts).toEqual([]);
    expect(second.tray).toEqual([]);
  });

  it("places a weekly variable every week", () => {
    const { inserts } = planWeek(input({ items: [variable("rack", 1)], lastDone: new Map([["rack", "2026-10-21"]]) }));
    expect(inserts).toEqual([{ item_id: "rack", date: "2026-10-28", half: "am", origin: "auto" }]);
  });

  it("places a 13-week item only in the week it falls due", () => {
    const items = [variable("hood", 13)];
    const lastDone = new Map([["hood", "2026-08-03"]]); // due 2026-11-02
    expect(planWeek(input({ items, lastDone })).inserts).toEqual([]);
    const next = planWeek(input({ weekStart: "2026-11-02", fromDate: "2026-11-02", items, lastDone }));
    expect(next.inserts).toHaveLength(1);
  });

  it("puts the most overdue first and respects the per-slot cap", () => {
    const items = [variable("a", 2, "am"), variable("b", 2, "am"), variable("c", 2, "am")];
    const lastDone = new Map([
      ["a", "2026-10-01"],
      ["b", "2026-09-01"],
      ["c", "2026-10-10"],
    ]);
    const capsOneMonday = caps(0);
    capsOneMonday.set("1|am", 2);
    const { inserts, tray } = planWeek(input({ items, lastDone, caps: capsOneMonday }));
    expect(inserts.map((i) => i.item_id)).toEqual(["b", "a"]);
    expect(tray).toEqual(["c"]);
  });

  it("gives a slot capped at 0 no variables, and overflow goes to the tray, not dropped", () => {
    const { inserts, tray } = planWeek(input({ items: [variable("a", 1), variable("b", 1)], caps: caps(0) }));
    expect(inserts).toEqual([]);
    expect(tray).toEqual(["a", "b"]);
  });

  it("caps never block constants", () => {
    const { inserts } = planWeek(input({ items: [constant("mop", [1], "am")], caps: caps(0) }));
    expect(inserts).toHaveLength(1);
  });

  it("honours AM, PM and Either", () => {
    const items = [variable("p", 1, "pm"), variable("e", 1, "either")];
    const capsOne = caps(1);
    const { inserts } = planWeek(input({ items, caps: capsOne }));
    expect(inserts).toEqual([
      { item_id: "e", date: MON, half: "am", origin: "auto" },
      { item_id: "p", date: MON, half: "pm", origin: "auto" },
    ]);
  });

  it("prefers a slot on or after the due date", () => {
    const { inserts } = planWeek(input({ items: [variable("v", 2)], lastDone: new Map([["v", "2026-10-15"]]) }));
    expect(inserts[0]?.date).toBe("2026-10-29");
  });

  it("skips a variable already on this week's board (moved, skipped, or carried over)", () => {
    const { inserts, tray } = planWeek(
      input({
        items: [variable("v", 1)],
        existing: [{ item_id: "v", date: "2026-10-30", half: "pm", status: "skipped", itemKind: "variable" }],
      }),
    );
    expect(inserts).toEqual([]);
    expect(tray).toEqual([]);
  });

  it("counts variables already in a slot against its cap, but not skipped ones", () => {
    const capsOneMonday = caps(0);
    capsOneMonday.set("1|am", 1);
    const busy = planWeek(
      input({
        items: [variable("new", 1, "am")],
        caps: capsOneMonday,
        existing: [{ item_id: "old", date: MON, half: "am", status: "planned", itemKind: "variable" }],
      }),
    );
    expect(busy.tray).toEqual(["new"]);
    const skipped = planWeek(
      input({
        items: [variable("new", 1, "am")],
        caps: capsOneMonday,
        existing: [{ item_id: "old", date: MON, half: "am", status: "skipped", itemKind: "variable" }],
      }),
    );
    expect(skipped.inserts).toHaveLength(1);
  });

  it("leaves items not due until after the week alone", () => {
    const { inserts, tray } = planWeek(
      input({ items: [variable("v", 4)], lastDone: new Map([["v", "2026-10-20"]]) }),
    );
    expect(inserts).toEqual([]);
    expect(tray).toEqual([]);
  });
});

describe("dueNotPlaced", () => {
  it("lists due variables with no clean on the week, most overdue first", () => {
    const items = [variable("a", 2), variable("b", 2), variable("placed", 1), variable("later", 8)];
    const lastDone = new Map([
      ["a", "2026-10-10"],
      ["b", "2026-09-10"],
      ["later", "2026-10-20"],
    ]);
    const existing = [{ item_id: "placed", date: MON, half: "am" as const, status: "planned" as const, itemKind: "variable" as const }];
    expect(dueNotPlaced({ weekStart: MON, items, lastDone, existing })).toEqual(["b", "a"]);
  });
});

describe("review fixes (PR #89)", () => {
  it("drops today's AM once the morning is over", () => {
    expect(weekSlots(MON, "2026-10-28", "pm")[0]).toEqual({ date: "2026-10-28", weekday: 3, half: "pm" });
    const { inserts } = planWeek(
      input({ fromDate: MON, fromHalf: "pm", items: [constant("am-only", [1], "am"), constant("pm-too", [1], "pm")] }),
    );
    expect(inserts.map((i) => i.item_id)).toEqual(["pm-too"]);
  });

  it("falls back to the open slot closest before the due date, not the earliest", () => {
    const capsNoSat = caps(1);
    capsNoSat.set("6|am", 0);
    capsNoSat.set("6|pm", 0);
    const { inserts } = planWeek(
      input({ items: [variable("w", 1)], caps: capsNoSat, lastDone: new Map([["w", "2026-10-24"]]) }),
    );
    // Due Sat Oct 31, Saturday is full: Friday PM, not Monday.
    expect(inserts).toEqual([{ item_id: "w", date: "2026-10-30", half: "pm", origin: "auto" }]);
  });

  it("projects a planned clean as done on its date, ignoring earlier ones", () => {
    const projected = projectLastDone(new Map([["a", "2026-10-01"]]), [
      { item_id: "a", date: "2026-10-31" },
      { item_id: "b", date: "2026-10-29" },
    ]);
    expect(projected.get("a")).toBe("2026-10-31");
    expect(projected.get("b")).toBe("2026-10-29");
    expect(projectLastDone(new Map([["a", "2026-11-02"]]), [{ item_id: "a", date: "2026-10-31" }]).get("a")).toBe(
      "2026-11-02",
    );
  });

  it("builds two weeks back to back without placing a variable twice", () => {
    const items = [variable("quarterly", 13), variable("weekly", 1)];
    const lastDone = new Map([
      ["quarterly", "2026-08-01"], // due Sat Oct 31
      ["weekly", "2026-10-22"], // due Thu Oct 29
    ]);
    const thisWeek = planWeek(input({ items, lastDone }));
    expect(thisWeek.inserts.map((i) => [i.item_id, i.date])).toEqual([
      ["weekly", "2026-10-29"],
      ["quarterly", "2026-10-31"],
    ]);

    // Thursday night: both still open on this week's board.
    const nextStart = "2026-11-02";
    const planned = thisWeek.inserts.map((i) => ({ item_id: i.item_id, date: i.date }));
    const nextWeek = planWeek(
      input({ weekStart: nextStart, fromDate: nextStart, items, lastDone: projectLastDone(lastDone, planned) }),
    );
    // The quarterly item is not due again; the weekly one lands a week after Thursday.
    expect(nextWeek.inserts).toEqual([{ item_id: "weekly", date: "2026-11-05", half: "am", origin: "auto" }]);
  });
});
