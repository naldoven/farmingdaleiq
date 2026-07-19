import { describe, expect, it } from "vitest";

import {
  averageCategoryScores,
  colorForRating,
  computeAverage,
  isQualified,
  isRerateDue,
  rateableColumns,
  ratingCellTitle,
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

describe("rateableColumns (RAT1)", () => {
  it("drops onboarding-roadmap items (is_rateable === false)", () => {
    const cols = rateableColumns([
      { id: "p1", name: "Orientation", is_rateable: false, groupName: "FOH" },
      { id: "p2", name: "Register 1", is_rateable: true, groupName: "Front Counter" },
    ]);
    expect(cols.map((c) => c.name)).toEqual(["Register 1"]);
  });

  it("keeps positions with a missing is_rateable so nothing real is hidden", () => {
    const cols = rateableColumns([{ id: "p1", name: "Beverage" }]);
    expect(cols).toHaveLength(1);
    expect(cols[0].showGroup).toBe(false);
  });

  it("flags duplicated station names to show their group, uniques stay unlabeled", () => {
    const cols = rateableColumns([
      { id: "a", name: "Register 1", is_rateable: true, groupName: "Front Counter" },
      { id: "b", name: "Register 1", is_rateable: true, groupName: "Drive Thru" },
      { id: "c", name: "Beverage", is_rateable: true, groupName: "Front Counter" },
    ]);
    const byId = new Map(cols.map((c) => [c.id, c]));
    expect(byId.get("a")?.showGroup).toBe(true);
    expect(byId.get("b")?.showGroup).toBe(true);
    expect(byId.get("a")?.groupName).toBe("Front Counter");
    expect(byId.get("b")?.groupName).toBe("Drive Thru");
    expect(byId.get("c")?.showGroup).toBe(false);
  });

  it("does not double-count a name that appears once rateable and once not", () => {
    const cols = rateableColumns([
      { id: "a", name: "Register 1", is_rateable: true, groupName: "Front Counter" },
      { id: "b", name: "Register 1", is_rateable: false, groupName: "FOH" },
    ]);
    expect(cols).toHaveLength(1);
    expect(cols[0].showGroup).toBe(false);
  });
});

describe("ratingCellTitle (RAT4)", () => {
  it("is just the name pair when there is no comment", () => {
    expect(ratingCellTitle("Sam", "Register 1")).toBe("Sam — Register 1");
    expect(ratingCellTitle("Sam", "Register 1", "   ")).toBe("Sam — Register 1");
  });

  it("appends the prior comment so it shows in the tooltip", () => {
    expect(ratingCellTitle("Sam", "Register 1", "Fast hands")).toContain("Fast hands");
  });
});
