import { describe, expect, it } from "vitest";

import type { ItemRow, PhotoRow } from "@/app/(app)/cleaning/queries";
import {
  chunk,
  dueContext,
  isUuid,
  itemCadence,
  itemDueFields,
  itemToDetailsValue,
  parseMarkup,
  toListRows,
} from "@/app/(app)/cleaning/items/view";

const ITEM: ItemRow = {
  id: "a1111111-1111-4111-8111-111111111111",
  zone_id: "b2222222-2222-4222-8222-222222222222",
  name: "Boards deep clean",
  kind: "constant",
  days_of_week: [5, 2],
  half: "pm",
  interval_weeks: null,
  start_on: null,
  if_needed: false,
  note: null,
  status: "draft",
  created_by: null,
  created_at: "2026-10-26T22:00:00Z",
  approved_by: null,
  approved_at: null,
  sort: 0,
};

// Wednesday of the board week Mon Oct 26 to Sat Oct 31, 2026.
const TODAY = "2026-10-28";
const NO_HISTORY = dueContext(TODAY, new Map());

const PHOTO: PhotoRow = {
  id: "c3333333-3333-4333-8333-333333333333",
  item_id: ITEM.id,
  storage_path: "items/c3333333-3333-4333-8333-333333333333.jpg",
  markup: { strokes: [{ points: [[0.1, 0.1], [0.2, 0.2]] }] },
  kind: "reference",
  capture_source: "live",
  captured_at: null,
  created_at: "2026-10-26T22:00:00Z",
  taken_by: "d4444444-4444-4444-8444-444444444444",
};

describe("parseMarkup", () => {
  it("keeps good strokes", () => {
    expect(parseMarkup({ strokes: [{ points: [[0, 0], [1, 1]] }] })).toEqual({
      strokes: [{ points: [[0, 0], [1, 1]] }],
    });
  });

  it("drops bad points and empty strokes, and returns null when nothing is left", () => {
    expect(parseMarkup({ strokes: [{ points: [[0.5, 0.5], [2, 0.5], ["a", 1], [0.1]] }, { points: [] }] })).toEqual({
      strokes: [{ points: [[0.5, 0.5]] }],
    });
    expect(parseMarkup({ strokes: [{ points: [[5, 5]] }] })).toBeNull();
  });

  it("returns null for anything that is not a drawing", () => {
    for (const bad of [null, undefined, 3, "x", [], {}, { strokes: "no" }, { strokes: [null] }]) {
      expect(parseMarkup(bad)).toBeNull();
    }
  });
});

describe("itemToDetailsValue", () => {
  it("maps a stored row onto the form value with days in order", () => {
    expect(itemToDetailsValue({ ...ITEM, note: "Green pad", if_needed: true })).toEqual({
      zoneId: ITEM.zone_id,
      name: "Boards deep clean",
      kind: "constant",
      daysOfWeek: [2, 5],
      half: "pm",
      intervalWeeks: null,
      ifNeeded: true,
      note: "Green pad",
    });
  });

  it("maps a variable", () => {
    expect(
      itemToDetailsValue({ ...ITEM, kind: "variable", days_of_week: null, interval_weeks: 13, half: "either" }),
    ).toMatchObject({ kind: "variable", daysOfWeek: [], intervalWeeks: 13, half: "either" });
  });
});

describe("toListRows", () => {
  it("resolves the signed photo, cadence and drawing", () => {
    const rows = toListRows(
      [ITEM],
      new Map([[ITEM.id, PHOTO]]),
      new Map([[PHOTO.storage_path, "https://signed.test/p.jpg"]]),
      NO_HISTORY,
    );
    expect(rows).toEqual([
      {
        id: ITEM.id,
        zone_id: ITEM.zone_id,
        name: "Boards deep clean",
        status: "draft",
        cadence: "Tue, Fri PM",
        ifNeeded: false,
        photoUrl: "https://signed.test/p.jpg",
        photoMissing: false,
        markup: { strokes: [{ points: [[0.1, 0.1], [0.2, 0.2]] }] },
        dueState: null,
        dueStateText: null,
        dueLabel: null,
        lastCleanedLabel: null,
      },
    ]);
  });

  it("marks a photo whose URL did not sign as unavailable, not absent", () => {
    const [row] = toListRows([ITEM], new Map([[ITEM.id, PHOTO]]), new Map(), NO_HISTORY);
    expect(row.photoUrl).toBeNull();
    expect(row.photoMissing).toBe(true);
  });

  it("treats a seeded item without a photo as simply having none", () => {
    const [row] = toListRows([{ ...ITEM, status: "active" }], new Map(), new Map(), NO_HISTORY);
    expect(row).toMatchObject({ status: "active", photoUrl: null, photoMissing: false, markup: null });
  });

  it("never lists retired items", () => {
    expect(toListRows([{ ...ITEM, status: "retired" }], new Map(), new Map(), NO_HISTORY)).toEqual([]);
  });
});

const VARIABLE: ItemRow = {
  ...ITEM,
  kind: "variable",
  days_of_week: null,
  half: "either",
  interval_weeks: 2,
  status: "active",
};

function due(item: ItemRow, lastDone: Record<string, string> = {}, today = TODAY) {
  return itemDueFields(item, dueContext(today, new Map(Object.entries(lastDone))));
}

describe("dueContext", () => {
  it("ends the week on the board's Saturday", () => {
    expect(dueContext("2026-10-26", new Map()).weekEnd).toBe("2026-10-31"); // Monday
    expect(dueContext("2026-10-28", new Map()).weekEnd).toBe("2026-10-31");
    expect(dueContext("2026-10-31", new Map()).weekEnd).toBe("2026-10-31"); // Saturday
  });

  it("looks ahead to the coming week on Sunday, when the store is closed", () => {
    expect(dueContext("2026-11-01", new Map()).weekEnd).toBe("2026-11-07");
  });

  it("keeps the store-local date it was given", () => {
    expect(dueContext("2026-10-28", new Map()).today).toBe("2026-10-28");
  });
});

describe("itemDueFields on a variable", () => {
  it("is overdue and 'Due now' when never cleaned and given no start date", () => {
    expect(due(VARIABLE)).toEqual({
      dueState: "overdue",
      dueStateText: "Overdue",
      dueLabel: "Due now",
      lastCleanedLabel: "Never cleaned yet",
    });
  });

  it("starts a never-cleaned item from its start date", () => {
    expect(due({ ...VARIABLE, start_on: "2026-11-09" })).toMatchObject({
      dueState: "not_due",
      dueStateText: "Not due yet",
      dueLabel: "Next due Nov 9, 2026",
      lastCleanedLabel: "Never cleaned yet",
    });
    expect(due({ ...VARIABLE, start_on: "2026-10-30" })).toMatchObject({ dueState: "due_this_week" });
    expect(due({ ...VARIABLE, start_on: "2026-10-27" })).toMatchObject({
      dueState: "overdue",
      dueLabel: "Next due Oct 27, 2026",
    });
  });

  it("adds the interval to the last clean", () => {
    // Cleaned Oct 12 every 2 weeks: due Oct 26, two days ago.
    expect(due(VARIABLE, { [VARIABLE.id]: "2026-10-12" })).toEqual({
      dueState: "overdue",
      dueStateText: "Overdue",
      dueLabel: "Next due Oct 26, 2026",
      lastCleanedLabel: "Last cleaned Oct 12, 2026",
    });
    // Cleaned Oct 26 every 2 weeks: due Nov 9, past this week.
    expect(due(VARIABLE, { [VARIABLE.id]: "2026-10-26" })).toMatchObject({
      dueState: "not_due",
      dueLabel: "Next due Nov 9, 2026",
    });
  });

  it("treats today and the week's Saturday as due this week, and the day after as not due", () => {
    // Cleaned Oct 14, 2 weeks: due today.
    expect(due(VARIABLE, { [VARIABLE.id]: "2026-10-14" })).toMatchObject({ dueState: "due_this_week" });
    // Cleaned Oct 17, 2 weeks: due Oct 31, the Saturday.
    expect(due(VARIABLE, { [VARIABLE.id]: "2026-10-17" })).toMatchObject({ dueState: "due_this_week" });
    // Cleaned Oct 18, 2 weeks: due Nov 1, one day past the week.
    expect(due(VARIABLE, { [VARIABLE.id]: "2026-10-18" })).toMatchObject({ dueState: "not_due" });
  });

  it("counts a quarterly item from its last clean", () => {
    expect(due({ ...VARIABLE, interval_weeks: 13 }, { [VARIABLE.id]: "2026-10-26" })).toMatchObject({
      dueState: "not_due",
      dueLabel: "Next due Jan 25, 2027",
    });
  });

  it("measures Sunday against next week's Saturday", () => {
    // Sunday Nov 1: the week shown is Nov 2 to Nov 7, so an item due Nov 7 is due this week.
    const itemDue = { ...VARIABLE, start_on: "2026-11-07" };
    expect(due(itemDue, {}, "2026-11-01")).toMatchObject({ dueState: "due_this_week" });
    expect(due({ ...itemDue, start_on: "2026-11-08" }, {}, "2026-11-01")).toMatchObject({ dueState: "not_due" });
  });
});

describe("itemDueFields on a constant", () => {
  const CONSTANT: ItemRow = { ...ITEM, status: "active" };

  it("shows the last clean and no dot", () => {
    expect(due(CONSTANT, { [CONSTANT.id]: "2026-10-20" })).toEqual({
      dueState: null,
      dueStateText: null,
      dueLabel: null,
      lastCleanedLabel: "Last cleaned Oct 20, 2026",
    });
  });

  it("says so when it has never been cleaned", () => {
    expect(due(CONSTANT)).toMatchObject({ dueState: null, lastCleanedLabel: "Never cleaned yet" });
  });
});

describe("itemDueFields on drafts and retired items", () => {
  const NOTHING = { dueState: null, dueStateText: null, dueLabel: null, lastCleanedLabel: null };

  it("shows no dot and no dates, even for an overdue-looking variable", () => {
    expect(due({ ...VARIABLE, status: "draft" })).toEqual(NOTHING);
    expect(due({ ...VARIABLE, status: "retired" })).toEqual(NOTHING);
    expect(due({ ...ITEM, status: "draft" })).toEqual(NOTHING);
  });
});

describe("toListRows due fields", () => {
  it("fills the dot for an active variable and leaves the draft beside it bare", () => {
    const draft: ItemRow = { ...VARIABLE, id: "e5555555-5555-4555-8555-555555555555", status: "draft" };
    const rows = toListRows([VARIABLE, draft], new Map(), new Map(), dueContext(TODAY, new Map()));
    expect(rows.map((r) => [r.status, r.dueState, r.lastCleanedLabel])).toEqual([
      ["active", "overdue", "Never cleaned yet"],
      ["draft", null, null],
    ]);
  });
});

describe("itemCadence", () => {
  it("prints days in weekday order even when stored out of order", () => {
    expect(itemCadence(ITEM)).toBe("Tue, Fri PM");
  });
});

describe("isUuid", () => {
  it("accepts uuids and rejects anything else", () => {
    expect(isUuid(ITEM.id)).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(`${ITEM.id}'`)).toBe(false);
  });
});

describe("chunk", () => {
  it("splits into batches and handles empty and exact sizes", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2], 2)).toEqual([[1, 2]]);
    expect(chunk([], 2)).toEqual([]);
  });
});
