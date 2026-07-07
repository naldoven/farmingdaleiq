import { describe, expect, it } from "vitest";

import {
  calculateAge,
  computeBadges,
  isBirthdayWindow,
  isLeaderRank,
  isMinor,
  isNewHire,
  needsBreakBadge,
} from "./badges";

const NOW = new Date("2026-07-07T12:00:00-04:00");

describe("isNewHire", () => {
  it("is true for a hire within the default 30-day window", () => {
    expect(isNewHire("2026-06-20", NOW)).toBe(true);
  });

  it("is false for a hire outside the window", () => {
    expect(isNewHire("2026-01-01", NOW)).toBe(false);
  });

  it("is false for a future hire date (clock skew safety)", () => {
    expect(isNewHire("2026-07-08", NOW)).toBe(false);
  });

  it("is false when hiredOn is null", () => {
    expect(isNewHire(null, NOW)).toBe(false);
  });
});

describe("calculateAge / isMinor", () => {
  it("calculates age correctly before this year's birthday", () => {
    expect(calculateAge("2009-12-01", NOW)).toBe(16);
  });

  it("calculates age correctly after this year's birthday", () => {
    expect(calculateAge("2008-01-01", NOW)).toBe(18);
  });

  it("flags under-18 as minor", () => {
    expect(isMinor("2009-12-01", NOW)).toBe(true);
  });

  it("does not flag 18+ as minor", () => {
    expect(isMinor("2000-01-01", NOW)).toBe(false);
  });

  it("is false when birthdate is null", () => {
    expect(isMinor(null, NOW)).toBe(false);
  });
});

describe("isBirthdayWindow", () => {
  it("is true for today's birthday", () => {
    expect(isBirthdayWindow("1990-07-07", NOW)).toBe(true);
  });

  it("is true for a birthday later this week", () => {
    expect(isBirthdayWindow("1990-07-10", NOW)).toBe(true);
  });

  it("is false for a birthday outside the window", () => {
    expect(isBirthdayWindow("1990-08-01", NOW)).toBe(false);
  });

  it("wraps across a year boundary", () => {
    const dec31 = new Date("2026-12-30T12:00:00-05:00");
    expect(isBirthdayWindow("1990-01-02", dec31)).toBe(true);
  });
});

describe("isLeaderRank", () => {
  it("treats rank 1-6 as leader", () => {
    expect(isLeaderRank(1)).toBe(true);
    expect(isLeaderRank(6)).toBe(true);
  });

  it("treats rank 7+ as not leader", () => {
    expect(isLeaderRank(7)).toBe(false);
    expect(isLeaderRank(10)).toBe(false);
  });

  it("treats null rank as not leader", () => {
    expect(isLeaderRank(null)).toBe(false);
  });
});

describe("needsBreakBadge", () => {
  it("is true when overdue", () => {
    expect(needsBreakBadge("overdue", null, NOW)).toBe(true);
  });

  it("is true when authorized but not yet started", () => {
    expect(needsBreakBadge("authorized", null, NOW)).toBe(true);
  });

  it("is true when pending and due", () => {
    const due = new Date(NOW.getTime() - 1000);
    expect(needsBreakBadge("pending", due, NOW)).toBe(true);
  });

  it("is false when pending but not yet due", () => {
    const due = new Date(NOW.getTime() + 60_000);
    expect(needsBreakBadge("pending", due, NOW)).toBe(false);
  });

  it("is false when completed", () => {
    expect(needsBreakBadge("completed", null, NOW)).toBe(false);
  });

  it("is false with no break record", () => {
    expect(needsBreakBadge(null, null, NOW)).toBe(false);
  });
});

describe("computeBadges", () => {
  it("combines every applicable badge", () => {
    const badges = computeBadges(
      {
        hiredOn: "2026-06-25",
        birthdate: "2009-07-07",
        roleRank: 6,
        isTrainee: true,
        breakStatus: "overdue",
        breakDueAt: null,
      },
      NOW,
    );

    const kinds = badges.map((b) => b.kind).sort();
    expect(kinds).toEqual(["birthday", "leader", "minor", "needs_break", "new", "trainee"]);
  });

  it("returns an empty list when nothing applies", () => {
    const badges = computeBadges(
      {
        hiredOn: "2020-01-01",
        birthdate: "1985-01-01",
        roleRank: 10,
        isTrainee: false,
        breakStatus: "completed",
        breakDueAt: null,
      },
      NOW,
    );
    expect(badges).toEqual([]);
  });
});
