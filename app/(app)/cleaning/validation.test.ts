import { describe, expect, it } from "vitest";

import {
  itemDetailsSchema,
  markupSchema,
  walkthroughSaveSchema,
} from "@/app/(app)/cleaning/validation";

const ZONE = "11111111-1111-4111-8111-111111111111";
const PHOTO = "22222222-2222-4222-8222-222222222222";

describe("itemDetailsSchema", () => {
  it("accepts a constant and stores only its days, sorted and de-duplicated", () => {
    const row = itemDetailsSchema.parse({
      zoneId: ZONE,
      name: "  Boards deep clean ",
      kind: "constant",
      daysOfWeek: [4, 2, 2],
      half: "pm",
      intervalWeeks: 3,
    });
    expect(row).toEqual({
      zone_id: ZONE,
      name: "Boards deep clean",
      kind: "constant",
      days_of_week: [2, 4],
      interval_weeks: null,
      half: "pm",
      if_needed: false,
      note: null,
    });
  });

  it("accepts a variable and drops stale days from a toggled form", () => {
    const row = itemDetailsSchema.parse({
      zoneId: ZONE,
      name: "Vent above boards",
      kind: "variable",
      daysOfWeek: [1],
      half: "either",
      intervalWeeks: 13,
      ifNeeded: true,
      note: "Use the ladder",
    });
    expect(row.days_of_week).toBeNull();
    expect(row.interval_weeks).toBe(13);
    expect(row.if_needed).toBe(true);
    expect(row.note).toBe("Use the ladder");
  });

  it("requires a day for a constant", () => {
    const result = itemDetailsSchema.safeParse({ zoneId: ZONE, name: "X", kind: "constant", half: "am" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain("Pick at least one day");
  });

  it("refuses Sunday, the store is closed", () => {
    const result = itemDetailsSchema.safeParse({
      zoneId: ZONE,
      name: "X",
      kind: "constant",
      daysOfWeek: [0],
      half: "am",
    });
    expect(result.success).toBe(false);
  });

  it("refuses 'either' for a constant", () => {
    const result = itemDetailsSchema.safeParse({
      zoneId: ZONE,
      name: "X",
      kind: "constant",
      daysOfWeek: [1],
      half: "either",
    });
    expect(result.error?.issues.map((i) => i.message)).toContain("A constant is AM or PM");
  });

  it("requires an allowed week count for a variable", () => {
    expect(
      itemDetailsSchema.safeParse({ zoneId: ZONE, name: "X", kind: "variable", half: "pm" }).success,
    ).toBe(false);
    expect(
      itemDetailsSchema.safeParse({ zoneId: ZONE, name: "X", kind: "variable", half: "pm", intervalWeeks: 5 })
        .success,
    ).toBe(false);
  });

  it("requires a name", () => {
    const result = itemDetailsSchema.safeParse({ zoneId: ZONE, name: "   ", kind: "variable", half: "pm", intervalWeeks: 1 });
    expect(result.error?.issues.map((i) => i.message)).toContain("Name the item");
  });
});

describe("markupSchema", () => {
  it("accepts normalized strokes", () => {
    expect(markupSchema.safeParse({ strokes: [{ points: [[0, 0], [0.5, 1]] }] }).success).toBe(true);
  });

  it("refuses points outside 0-1", () => {
    expect(markupSchema.safeParse({ strokes: [{ points: [[1.2, 0]] }] }).success).toBe(false);
  });

  it("refuses an absurd number of strokes", () => {
    const strokes = Array.from({ length: 41 }, () => ({ points: [[0.1, 0.1]] as [number, number][] }));
    expect(markupSchema.safeParse({ strokes }).success).toBe(false);
  });
});

describe("walkthroughSaveSchema", () => {
  it("accepts a new item with details", () => {
    const parsed = walkthroughSaveSchema.parse({
      photoId: PHOTO,
      capturedAt: "2026-10-26T22:15:00.000Z",
      captureSource: "live",
      target: {
        mode: "new",
        details: { zoneId: ZONE, name: "Walk-in rack 1", kind: "variable", half: "either", intervalWeeks: 6 },
      },
    });
    expect(parsed.markup).toBeNull();
    expect(parsed.target.mode).toBe("new");
  });

  it("accepts attaching to an existing item", () => {
    const parsed = walkthroughSaveSchema.parse({
      photoId: PHOTO,
      captureSource: "file",
      markup: { strokes: [] },
      target: { mode: "existing", itemId: ZONE },
    });
    expect(parsed.target).toEqual({ mode: "existing", itemId: ZONE });
  });

  it("refuses a photo id that is not a uuid", () => {
    expect(
      walkthroughSaveSchema.safeParse({
        photoId: "../../etc",
        captureSource: "live",
        target: { mode: "existing", itemId: ZONE },
      }).success,
    ).toBe(false);
  });
});
