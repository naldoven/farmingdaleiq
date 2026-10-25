import { describe, expect, it } from "vitest";

import type { ItemRow, PhotoRow } from "@/app/(app)/cleaning/queries";
import { chunk, isUuid, itemCadence, itemToDetailsValue, parseMarkup, toListRows } from "@/app/(app)/cleaning/items/view";

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
      },
    ]);
  });

  it("marks a photo whose URL did not sign as unavailable, not absent", () => {
    const [row] = toListRows([ITEM], new Map([[ITEM.id, PHOTO]]), new Map());
    expect(row.photoUrl).toBeNull();
    expect(row.photoMissing).toBe(true);
  });

  it("treats a seeded item without a photo as simply having none", () => {
    const [row] = toListRows([{ ...ITEM, status: "active" }], new Map(), new Map());
    expect(row).toMatchObject({ status: "active", photoUrl: null, photoMissing: false, markup: null });
  });

  it("never lists retired items", () => {
    expect(toListRows([{ ...ITEM, status: "retired" }], new Map(), new Map())).toEqual([]);
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
