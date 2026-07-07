import { describe, expect, it } from "vitest";

import {
  averageCategoryScores,
  colorForRating,
  computeAverage,
  isQualified,
  isRerateDue,
  rerateDueDate,
} from "./logic";

describe("isQualified", () => {
  it("is qualified at exactly 3 stars", () => {
    expect(isQualified(3)).toBe(true);
  });
  it("is not qualified below 3 stars", () => {
    expect(isQualified(2.9)).toBe(false);
  });
});

describe("computeAverage", () => {
  it("returns null for an empty list", () => {
    expect(computeAverage([])).toBeNull();
  });
  it("averages and rounds to 2 decimals", () => {
    expect(computeAverage([5, 4, 3])).toBe(4);
    expect(computeAverage([5, 4, 4])).toBeCloseTo(4.33, 2);
  });
});

describe("averageCategoryScores", () => {
  it("averages only the populated categories", () => {
    expect(averageCategoryScores({ category_1: 4, category_2: 5, category_3: null, category_4: null })).toBe(4.5);
  });
  it("returns 0 when nothing is populated", () => {
    expect(averageCategoryScores({})).toBe(0);
  });
});

describe("colorForRating", () => {
  it("is 'none' with no rating", () => {
    expect(colorForRating(null, 4)).toBe("none");
  });
  it("is 'above' when stars exceed the store average", () => {
    expect(colorForRating(4.5, 3.5)).toBe("above");
  });
  it("is 'below' when stars are under the store average", () => {
    expect(colorForRating(2, 3.5)).toBe("below");
  });
  it("is 'even' when equal to the store average", () => {
    expect(colorForRating(3.5, 3.5)).toBe("even");
  });
});

describe("isRerateDue / rerateDueDate", () => {
  it("is not due before 30 days", () => {
    const now = new Date("2026-07-15T00:00:00Z");
    const ratedAt = new Date("2026-07-01T00:00:00Z");
    expect(isRerateDue(ratedAt, now)).toBe(false);
  });
  it("is due at exactly 30 days", () => {
    const now = new Date("2026-07-31T00:00:00Z");
    const ratedAt = new Date("2026-07-01T00:00:00Z");
    expect(isRerateDue(ratedAt, now)).toBe(true);
  });
  it("computes the due date 30 days after rated_at", () => {
    const ratedAt = new Date("2026-07-01T00:00:00Z");
    const due = rerateDueDate(ratedAt);
    expect(due.toISOString().slice(0, 10)).toBe("2026-07-31");
  });
});
