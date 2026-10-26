import { describe, expect, it } from "vitest";

import {
  addLabel,
  buildCards,
  buildPullItems,
  buildWeekView,
  cardTags,
  dayLabel,
  filterPullItems,
  isMovable,
  isPastDay,
  isRemovable,
  isRestorable,
  longDayLabel,
  openingWeekday,
  parseDayParam,
  shortDate,
  slotLoad,
  statusInfo,
  toBoardAssignments,
  toExistingAssignments,
  trayRows,
  weekDays,
  weekRangeLabel,
  weekToggleStarts,
  type BoardAssignment,
  type BoardItem,
  type BoardZone,
  type CapRecord,
} from "@/app/(app)/cleaning/board-view";
import type { PlanItem } from "@/app/(app)/cleaning/week-logic";

// 2026-10-26 is a Monday.
const MON = "2026-10-26";

const GREEN: BoardZone = { id: "z-green", name: "Green", color: "#16A34A", side: "boh", sort: 1 };
const BLUE: BoardZone = { id: "z-blue", name: "Blue", color: "#1D4ED8", side: "boh", sort: 3 };
const RED: BoardZone = { id: "z-red", name: "Red", color: "#DC2626", side: "foh", sort: 4 };
const ZONES = [BLUE, GREEN, RED];

function item(id: string, zone: BoardZone, kind: "constant" | "variable", over: Partial<BoardItem> = {}): BoardItem {
  return { id, name: id, zone_id: zone.id, kind, sort: 0, ...over };
}

function row(
  id: string,
  itemId: string,
  date: string,
  half: "am" | "pm",
  over: Partial<BoardAssignment> = {},
): BoardAssignment {
  return { id, item_id: itemId, date, half, origin: "auto", status: "planned", skip_reason: null, ...over };
}

function caps(value: number): CapRecord {
  const record: CapRecord = {};
  for (let d = 1; d <= 6; d += 1) {
    record[`${d}|am`] = value;
    record[`${d}|pm`] = value;
  }
  return record;
}

describe("date labels", () => {
  it("formats from the string, so no time zone can shift a day", () => {
    expect(shortDate("2026-10-26")).toBe("Oct 26");
    expect(shortDate("2026-01-05")).toBe("Jan 5");
    expect(dayLabel("2026-10-26")).toBe("Mon Oct 26");
    expect(dayLabel("2026-10-31")).toBe("Sat Oct 31");
    expect(longDayLabel("2026-10-28")).toBe("Wednesday, Oct 28");
  });

  it("labels the week range, with the year for the printed sheet", () => {
    expect(weekRangeLabel(MON)).toBe("Oct 26 to Oct 31");
    expect(weekRangeLabel(MON, { year: true })).toBe("Oct 26 to Oct 31, 2026");
  });

  it("shows both years when a week crosses New Year", () => {
    expect(weekRangeLabel("2026-12-28", { year: true })).toBe("Dec 28, 2026 to Jan 2, 2027");
  });

  it("lists Monday to Saturday only", () => {
    const days = weekDays(MON);
    expect(days.map((d) => d.short)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    expect(days.map((d) => d.date)).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
    ]);
    expect(days[5]!.dayOfMonth).toBe(31);
  });

  it("walks across the DST change without drifting", () => {
    // DST ends Sunday 2026-11-01 in New York; the week after must still start Monday 11-02.
    expect(weekToggleStarts(MON)).toEqual({ thisWeek: MON, nextWeek: "2026-11-02" });
    expect(weekDays("2026-11-02")[0]!.date).toBe("2026-11-02");
  });
});

describe("which day the board opens on", () => {
  it("reads ?day=1..6 and ignores anything else", () => {
    expect(parseDayParam("3")).toBe(3);
    expect(parseDayParam("6")).toBe(6);
    expect(parseDayParam("0")).toBeNull();
    expect(parseDayParam("7")).toBeNull();
    expect(parseDayParam("12")).toBeNull();
    expect(parseDayParam("abc")).toBeNull();
    expect(parseDayParam(undefined)).toBeNull();
  });

  it("uses the link's day first", () => {
    expect(openingWeekday(MON, "2026-10-28", 5)).toBe(5);
  });

  it("opens on today when today is inside the week", () => {
    expect(openingWeekday(MON, "2026-10-28", null)).toBe(3);
    expect(openingWeekday(MON, "2026-10-31", null)).toBe(6);
  });

  it("opens on Monday for a week that is not this one", () => {
    expect(openingWeekday("2026-11-02", "2026-10-28", null)).toBe(1);
    expect(openingWeekday("2026-10-19", "2026-10-28", null)).toBe(1);
  });

  it("opens on Monday when today is Sunday, the closed day", () => {
    expect(openingWeekday("2026-11-02", "2026-11-01", null)).toBe(1);
    expect(openingWeekday(MON, "2026-11-01", null)).toBe(1);
  });
});

describe("card tags and status", () => {
  it("tags carried over, redo and added cleans", () => {
    expect(cardTags("carry_over", "planned", null)).toEqual([{ label: "Carried over", tone: "warning" }]);
    expect(cardTags("redo", "planned", null)).toEqual([{ label: "Redo", tone: "danger" }]);
    expect(cardTags("manual", "planned", null)).toEqual([{ label: "Added", tone: "info" }]);
  });

  it("gives constants and auto-placed cleans no origin tag", () => {
    expect(cardTags("constant", "planned", null)).toEqual([]);
    expect(cardTags("auto", "planned", null)).toEqual([]);
  });

  it("shows the skip reason in the tag", () => {
    expect(cardTags("auto", "skipped", "Walk-in is being serviced")).toEqual([
      { label: "Skipped: Walk-in is being serviced", tone: "warning" },
    ]);
    expect(cardTags("auto", "skipped", null)).toEqual([{ label: "Skipped", tone: "warning" }]);
  });

  it("stacks tags: an added clean that was then skipped", () => {
    expect(cardTags("manual", "skipped", "Out of time").map((t) => t.label)).toEqual([
      "Added",
      "Skipped: Out of time",
    ]);
  });

  it("shows no status chip for planned or skipped, a chip for the rest", () => {
    expect(statusInfo("planned")).toBeNull();
    expect(statusInfo("skipped")).toBeNull();
    expect(statusInfo("done")).toEqual({ label: "Done", tone: "success" });
    expect(statusInfo("not_needed")).toEqual({ label: "Checked, not needed", tone: "success" });
    expect(statusInfo("missed")).toEqual({ label: "Missed", tone: "danger" });
  });
});

describe("what a planner may do to a card", () => {
  it("lets only a planned clean move", () => {
    expect(isMovable({ status: "planned" })).toBe(true);
    for (const status of ["done", "not_needed", "skipped", "missed"] as const) {
      expect(isMovable({ status })).toBe(false);
    }
  });

  it("never removes a constant, and only removes while planned", () => {
    expect(isRemovable({ status: "planned", origin: "constant" })).toBe(false);
    for (const origin of ["auto", "manual", "carry_over", "redo"] as const) {
      expect(isRemovable({ status: "planned", origin })).toBe(true);
    }
    expect(isRemovable({ status: "done", origin: "manual" })).toBe(false);
    expect(isRemovable({ status: "skipped", origin: "auto" })).toBe(false);
  });

  it("offers undo only on a skipped clean", () => {
    expect(isRestorable({ status: "skipped" })).toBe(true);
    expect(isRestorable({ status: "planned" })).toBe(false);
  });
});

describe("cards", () => {
  const items = [
    item("vent", BLUE, "variable", { name: "Vent above boards" }),
    item("boards", GREEN, "constant", { name: "Boards deep clean" }),
    item("lockers", BLUE, "constant", { name: "Clean lockers" }),
    item("hood", GREEN, "variable", { name: "Hood filters" }),
    item("shelf", GREEN, "variable", { name: "Shelf 2", sort: 5 }),
    item("rack", GREEN, "variable", { name: "Rack", sort: 1 }),
  ];

  it("puts constants first, then variables, each by zone then sort then name", () => {
    const cards = buildCards(
      [
        row("a1", "vent", MON, "am"),
        row("a2", "lockers", MON, "am", { origin: "constant" }),
        row("a3", "shelf", MON, "am"),
        row("a4", "boards", MON, "am", { origin: "constant" }),
        row("a5", "hood", MON, "am"),
        row("a6", "rack", MON, "am"),
      ],
      items,
      ZONES,
    );
    expect(cards.map((c) => c.itemId)).toEqual([
      "boards", // constant, Green
      "lockers", // constant, Blue
      "hood", // variable, Green, sort 0
      "rack", // variable, Green, sort 1
      "shelf", // variable, Green, sort 5
      "vent", // variable, Blue
    ]);
  });

  it("carries the zone color, name and tags a card needs", () => {
    const [card] = buildCards([row("a1", "boards", MON, "pm", { origin: "carry_over" })], items, ZONES);
    expect(card).toMatchObject({
      id: "a1",
      name: "Boards deep clean",
      zoneName: "Green",
      zoneColor: "#16A34A",
      zoneSide: "boh",
      kind: "constant",
      half: "pm",
    });
    expect(card!.tags.map((t) => t.label)).toEqual(["Carried over"]);
  });

  it("still shows a clean whose item cannot be found, instead of hiding it", () => {
    const [card] = buildCards([row("a1", "gone", MON, "am")], items, ZONES);
    expect(card).toMatchObject({ name: "Unknown item", zoneName: "No zone" });
  });

  it("narrows the database rows' plain strings", () => {
    const [a] = toBoardAssignments([
      { id: "a1", item_id: "boards", date: MON, half: "pm", origin: "manual", status: "skipped", skip_reason: "No time" },
    ]);
    expect(a).toEqual({
      id: "a1",
      item_id: "boards",
      date: MON,
      half: "pm",
      origin: "manual",
      status: "skipped",
      skip_reason: "No time",
    });
  });

  it("maps rows to what dueNotPlaced reads, defaulting an unknown item to constant", () => {
    const existing = toExistingAssignments(
      [row("a1", "vent", MON, "am"), row("a2", "boards", MON, "am"), row("a3", "gone", MON, "pm")],
      items,
    );
    expect(existing.map((e) => e.itemKind)).toEqual(["variable", "constant", "constant"]);
    expect(existing[0]).toEqual({ item_id: "vent", date: MON, half: "am", status: "planned", itemKind: "variable" });
  });
});

describe("variable load against the cap", () => {
  const items = [
    item("c1", GREEN, "constant"),
    item("v1", GREEN, "variable"),
    item("v2", GREEN, "variable"),
    item("v3", GREEN, "variable"),
  ];

  function cardsFor(rows: BoardAssignment[]) {
    return buildCards(rows, items, ZONES);
  }

  it("counts variables only; constants do not use up the cap", () => {
    const load = slotLoad(
      cardsFor([row("a", "c1", MON, "am", { origin: "constant" }), row("b", "v1", MON, "am")]),
      1,
      "am",
      caps(2),
    );
    expect(load).toMatchObject({ load: 1, cap: 2, state: "open", label: "Variables 1 of 2" });
  });

  it("reads full when the slot is at its cap", () => {
    const load = slotLoad(cardsFor([row("a", "v1", MON, "am"), row("b", "v2", MON, "am")]), 1, "am", caps(2));
    expect(load).toMatchObject({ load: 2, cap: 2, state: "full", label: "Variables 2 of 2" });
  });

  it("reads over when a planner pushed past the cap", () => {
    const load = slotLoad(
      cardsFor([row("a", "v1", MON, "am"), row("b", "v2", MON, "am"), row("c", "v3", MON, "am")]),
      1,
      "am",
      caps(2),
    );
    expect(load).toMatchObject({ load: 3, cap: 2, state: "over", label: "Variables 3 of 2, over the cap" });
  });

  it("frees a place when a variable is skipped, as the build does", () => {
    const load = slotLoad(
      cardsFor([row("a", "v1", MON, "am"), row("b", "v2", MON, "am", { status: "skipped", skip_reason: "x" })]),
      1,
      "am",
      caps(2),
    );
    expect(load.load).toBe(1);
  });

  it("reads each weekday and half from its own cap", () => {
    const record: CapRecord = { "1|am": 0, "1|pm": 3 };
    expect(slotLoad([], 1, "am", record)).toMatchObject({ cap: 0, state: "full", label: "Variables 0 of 0" });
    expect(slotLoad([], 1, "pm", record)).toMatchObject({ cap: 3, state: "open" });
  });

  it("treats a missing cap as 0, so any variable there is over", () => {
    const load = slotLoad(cardsFor([row("a", "v1", MON, "am")]), 2, "am", {});
    expect(load).toMatchObject({ load: 1, cap: 0, state: "over" });
  });
});

describe("the week view", () => {
  const items = [
    item("c1", GREEN, "constant", { name: "Boards" }),
    item("c2", BLUE, "constant", { name: "Freezer" }),
    item("v1", GREEN, "variable", { name: "Hood" }),
    item("v2", BLUE, "variable", { name: "Vent" }),
    item("f1", RED, "variable", { name: "Windows" }),
  ];
  const rows = [
    row("a1", "c1", MON, "am", { origin: "constant" }),
    row("a2", "v1", MON, "am"),
    row("a3", "c2", MON, "pm", { origin: "constant" }),
    row("a4", "v2", "2026-10-28", "am"),
    row("a5", "v1", "2026-10-28", "pm", { status: "skipped", skip_reason: "Busy" }),
    row("a6", "f1", "2026-10-31", "pm"),
  ];

  it("groups by day and half, constants first", () => {
    const days = buildWeekView({ weekStart: MON, assignments: rows, items, zones: ZONES, caps: caps(2) });
    expect(days).toHaveLength(6);
    expect(days[0]!.am.cards.map((c) => c.id)).toEqual(["a1", "a2"]);
    expect(days[0]!.pm.cards.map((c) => c.id)).toEqual(["a3"]);
    expect(days[2]!.am.cards.map((c) => c.id)).toEqual(["a4"]);
    expect(days[2]!.pm.cards.map((c) => c.id)).toEqual(["a5"]);
    expect(days[1]!.am.cards).toEqual([]);
    expect(days[5]!.pm.cards.map((c) => c.id)).toEqual(["a6"]);
  });

  it("counts each day's cleans without the skipped ones", () => {
    const days = buildWeekView({ weekStart: MON, assignments: rows, items, zones: ZONES, caps: caps(2) });
    expect(days.map((d) => d.count)).toEqual([3, 0, 1, 0, 0, 1]);
  });

  it("labels each day and carries its variable load per half", () => {
    const days = buildWeekView({ weekStart: MON, assignments: rows, items, zones: ZONES, caps: caps(1) });
    expect(days[0]).toMatchObject({ label: "Mon Oct 26", longLabel: "Monday, Oct 26", weekday: 1 });
    expect(days[0]!.am.variables).toMatchObject({ load: 1, cap: 1, state: "full" });
    expect(days[0]!.pm.variables).toMatchObject({ load: 0, cap: 1, state: "open" });
    // The skipped variable on Wednesday PM frees its place.
    expect(days[2]!.pm.variables.load).toBe(0);
  });

  it("filters cards before grouping, for the print sheet's side and skip rules", () => {
    const days = buildWeekView({
      weekStart: MON,
      assignments: rows,
      items,
      zones: ZONES,
      caps: caps(2),
      include: (c) => c.zoneSide === "boh" && c.status !== "skipped",
    });
    expect(days[2]!.pm.cards).toEqual([]);
    expect(days[5]!.pm.cards).toEqual([]);
    expect(days.map((d) => d.count)).toEqual([3, 0, 1, 0, 0, 0]);
  });

  it("returns an empty, well-formed week when nothing is planned", () => {
    const days = buildWeekView({ weekStart: MON, assignments: [], items, zones: ZONES, caps: caps(2) });
    expect(days.every((d) => d.count === 0 && d.am.cards.length === 0 && d.pm.cards.length === 0)).toBe(true);
  });
});

describe("tray and pull picker", () => {
  const items = [
    { ...item("v1", GREEN, "variable", { name: "Hood filters", sort: 2 }), half: "either", days_of_week: null, interval_weeks: 4 },
    { ...item("v2", BLUE, "variable", { name: "Vent above boards", sort: 1 }), half: "am", days_of_week: null, interval_weeks: 2 },
    { ...item("c1", GREEN, "constant", { name: "Boards deep clean", sort: 1 }), half: "pm", days_of_week: [2, 5], interval_weeks: null },
    { ...item("draft", GREEN, "variable", { name: "Draft thing" }), half: "am", days_of_week: null, interval_weeks: 1 },
    { ...item("hidden", RED, "variable", { name: "Window ledge" }), half: "am", days_of_week: null, interval_weeks: 1 },
  ];
  // loadPlanItems returns only active items in active zones.
  const activePlan: PlanItem[] = ["v1", "v2", "c1"].map((id) => ({
    id,
    name: id,
    kind: "variable",
    days_of_week: null,
    half: "either",
    interval_weeks: 1,
    start_on: null,
    sort: 0,
  }));

  it("keeps the tray's order and shows the cadence", () => {
    const rows = trayRows(["v2", "v1"], items, ZONES);
    expect(rows.map((r) => r.itemId)).toEqual(["v2", "v1"]);
    expect(rows[0]).toMatchObject({ name: "Vent above boards", zoneName: "Blue", zoneColor: "#1D4ED8", cadence: "Every 2 weeks, AM" });
  });

  it("drops a tray id that has no item", () => {
    expect(trayRows(["v1", "nope"], items, ZONES).map((r) => r.itemId)).toEqual(["v1"]);
  });

  it("offers only active items in active zones, ordered by zone then sort", () => {
    const pull = buildPullItems(activePlan, items, ZONES);
    expect(pull.map((p) => p.id)).toEqual(["c1", "v1", "v2"]);
    expect(pull[0]).toMatchObject({ zoneName: "Green", cadence: "Tue, Fri PM", half: "pm" });
  });

  it("searches by item name or zone name, ignoring case and spacing", () => {
    const pull = buildPullItems(activePlan, items, ZONES);
    expect(filterPullItems(pull, "  VENT ").map((p) => p.id)).toEqual(["v2"]);
    expect(filterPullItems(pull, "green").map((p) => p.id)).toEqual(["c1", "v1"]);
    expect(filterPullItems(pull, "nothing like this")).toEqual([]);
    expect(filterPullItems(pull, "")).toHaveLength(3);
  });
});

describe("small helpers", () => {
  it("labels the add buttons with the selected day", () => {
    expect(addLabel("2026-10-27", "am")).toBe("Add to Tue AM");
    expect(addLabel("2026-10-31", "pm")).toBe("Add to Sat PM");
  });

  it("calls only an earlier day past, so today stays open", () => {
    expect(isPastDay("2026-10-27", "2026-10-28")).toBe(true);
    expect(isPastDay("2026-10-28", "2026-10-28")).toBe(false);
    expect(isPastDay("2026-10-29", "2026-10-28")).toBe(false);
  });
});
