import { describe, expect, it } from "vitest";

import {
  cadenceLabel,
  groupByZone,
  isStorageDuplicate,
  isUniqueViolation,
  normalizePoint,
  photoStoragePath,
  strokePoints,
  thinStroke,
} from "@/app/(app)/cleaning/logic";

describe("cadenceLabel", () => {
  it("names constant days and half", () => {
    expect(cadenceLabel({ kind: "constant", days_of_week: [2], half: "pm", interval_weeks: null })).toBe("Tue PM");
    expect(cadenceLabel({ kind: "constant", days_of_week: [1, 4], half: "am", interval_weeks: null })).toBe(
      "Mon, Thu AM",
    );
  });

  it("names variable intervals", () => {
    expect(cadenceLabel({ kind: "variable", days_of_week: null, half: "either", interval_weeks: 1 })).toBe(
      "Every week, AM or PM",
    );
    expect(cadenceLabel({ kind: "variable", days_of_week: null, half: "pm", interval_weeks: 13 })).toBe(
      "Every 13 weeks, PM",
    );
  });
});

describe("photoStoragePath", () => {
  it("maps the phone's photo id to one fixed path per type", () => {
    expect(photoStoragePath("abc", "image/jpeg")).toBe("items/abc.jpg");
    expect(photoStoragePath("abc", "image/webp")).toBe("items/abc.webp");
  });

  it("refuses types the bucket does not take", () => {
    expect(photoStoragePath("abc", "image/heic")).toBeNull();
    expect(photoStoragePath("abc", "text/html")).toBeNull();
  });
});

describe("duplicate detection", () => {
  it("spots a Postgres unique violation", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "42501" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });

  it("spots an existing storage object", () => {
    expect(isStorageDuplicate({ statusCode: "409", message: "x" })).toBe(true);
    expect(isStorageDuplicate({ message: "The resource already exists" })).toBe(true);
    expect(isStorageDuplicate({ statusCode: 403, message: "new row violates row-level security policy" })).toBe(false);
    expect(isStorageDuplicate(null)).toBe(false);
  });
});

describe("groupByZone", () => {
  it("orders by zone sort and drops empty zones", () => {
    const zones = [
      { id: "b", sort: 2 },
      { id: "a", sort: 1 },
      { id: "c", sort: 3 },
    ];
    const rows = [
      { zone_id: "b", n: 1 },
      { zone_id: "a", n: 2 },
      { zone_id: "b", n: 3 },
    ];
    const groups = groupByZone(zones, rows);
    expect(groups.map((g) => g.zone.id)).toEqual(["a", "b"]);
    expect(groups[1].rows.map((r) => r.n)).toEqual([1, 3]);
  });
});

describe("drawing helpers", () => {
  it("formats SVG points", () => {
    expect(strokePoints([[0, 0], [0.123456, 1]])).toBe("0,0 0.1235,1");
  });

  it("thins near-duplicate points but keeps both ends", () => {
    const points: [number, number][] = [
      [0, 0],
      [0.001, 0],
      [0.002, 0],
      [0.1, 0],
      [0.1005, 0],
    ];
    expect(thinStroke(points)).toEqual([
      [0, 0],
      [0.1, 0],
      [0.1005, 0],
    ]);
  });

  it("clamps pointer positions into the photo", () => {
    const box = { left: 10, top: 20, width: 100, height: 200 };
    expect(normalizePoint(60, 120, box)).toEqual([0.5, 0.5]);
    expect(normalizePoint(-5, 500, box)).toEqual([0, 1]);
  });
});
