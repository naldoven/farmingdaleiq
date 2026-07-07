import { describe, expect, it } from "vitest";

import {
  computeActivePoints,
  computeExpiresAt,
  findNewlyTriggeredThresholds,
  isInfractionActive,
  isLikelyDuplicateSubmission,
  shouldExpirePendingAction,
} from "./logic";

describe("computeExpiresAt", () => {
  it("rolling: expires exactly period_days after issuance", () => {
    const issuedAt = new Date("2026-01-01T00:00:00.000Z");
    const expires = computeExpiresAt(issuedAt, { period_kind: "rolling", period_days: 60 });
    expect(expires.toISOString()).toBe("2026-03-02T00:00:00.000Z");
  });

  it("rolling: floors fractional period_days and treats <1 as 1", () => {
    const issuedAt = new Date("2026-01-01T00:00:00.000Z");
    const expires = computeExpiresAt(issuedAt, { period_kind: "rolling", period_days: 0.4 });
    expect(expires.getTime() - issuedAt.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("fixed: expires at the end of the shared epoch-anchored window", () => {
    const days = 60;
    const windowMs = days * 24 * 60 * 60 * 1000;
    const windowIndex = 3;
    const issuedAt = new Date(windowIndex * windowMs + 1000);
    const expires = computeExpiresAt(issuedAt, { period_kind: "fixed", period_days: days });
    expect(expires.getTime()).toBe((windowIndex + 1) * windowMs);
  });

  it("fixed: two infractions in the same window share the same expiry", () => {
    const settings = { period_kind: "fixed", period_days: 30 };
    const windowMs = 30 * 24 * 60 * 60 * 1000;
    const windowStart = new Date(5 * windowMs);
    const a = computeExpiresAt(windowStart, settings);
    const b = computeExpiresAt(new Date(windowStart.getTime() + windowMs / 2), settings);
    expect(a.getTime()).toBe(b.getTime());
  });
});

describe("isInfractionActive / computeActivePoints", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");

  it("an infraction with no expiry is always active", () => {
    expect(isInfractionActive({ points: 5, expires_at: null }, now)).toBe(true);
  });

  it("an infraction expiring in the future is active", () => {
    expect(
      isInfractionActive({ points: 5, expires_at: "2026-06-02T00:00:00.000Z" }, now),
    ).toBe(true);
  });

  it("an infraction that already expired is not active", () => {
    expect(
      isInfractionActive({ points: 5, expires_at: "2026-05-01T00:00:00.000Z" }, now),
    ).toBe(false);
  });

  it("sums only the active infractions' points", () => {
    const infractions = [
      { points: 10, expires_at: "2026-05-01T00:00:00.000Z" }, // expired
      { points: 4, expires_at: "2026-07-01T00:00:00.000Z" }, // active
      { points: 30, expires_at: null }, // active, no expiry
    ];
    expect(computeActivePoints(infractions, now)).toBe(34);
  });

  it("returns 0 for an empty list", () => {
    expect(computeActivePoints([], now)).toBe(0);
  });
});

describe("findNewlyTriggeredThresholds", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");
  const ladder = [
    { id: "coaching", threshold_points: 10 },
    { id: "verbal", threshold_points: 15 },
    { id: "written", threshold_points: 20 },
  ];

  it("returns every rung at or under the active points when nothing has fired yet", () => {
    const result = findNewlyTriggeredThresholds(16, ladder, [], now, 60);
    expect(result.map((t) => t.id)).toEqual(["coaching", "verbal"]);
  });

  it("skips a rung already triggered within the current rolling window", () => {
    const existing = [{ type_id: "coaching", triggered_at: "2026-05-20T00:00:00.000Z" }];
    const result = findNewlyTriggeredThresholds(16, ladder, existing, now, 60);
    expect(result.map((t) => t.id)).toEqual(["verbal"]);
  });

  it("re-fires a rung whose prior trigger has rolled out of the window", () => {
    const existing = [{ type_id: "coaching", triggered_at: "2026-01-01T00:00:00.000Z" }];
    const result = findNewlyTriggeredThresholds(16, ladder, existing, now, 60);
    expect(result.map((t) => t.id)).toEqual(["coaching", "verbal"]);
  });

  it("returns nothing when points are below every threshold", () => {
    expect(findNewlyTriggeredThresholds(5, ladder, [], now, 60)).toEqual([]);
  });
});

describe("shouldExpirePendingAction", () => {
  it("expires a pending action once points decay below its threshold", () => {
    expect(shouldExpirePendingAction({ status: "pending" }, 8, 10)).toBe(true);
  });

  it("does not expire a pending action while points still meet the threshold", () => {
    expect(shouldExpirePendingAction({ status: "pending" }, 12, 10)).toBe(false);
  });

  it("never touches a non-pending action", () => {
    expect(shouldExpirePendingAction({ status: "acknowledged" }, 0, 10)).toBe(false);
    expect(shouldExpirePendingAction({ status: "expired" }, 0, 10)).toBe(false);
  });
});

describe("isLikelyDuplicateSubmission", () => {
  it("treats a very recent matching infraction as a duplicate", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    const candidate = { issued_at: "2026-06-01T00:00:00.000Z", note: "late" };
    expect(isLikelyDuplicateSubmission(candidate, new Date(now.getTime() + 1000))).toBe(true);
  });

  it("does not flag an older infraction as a duplicate", () => {
    const now = new Date("2026-06-01T00:00:10.000Z");
    const candidate = { issued_at: "2026-06-01T00:00:00.000Z", note: "late" };
    expect(isLikelyDuplicateSubmission(candidate, now, 5000)).toBe(false);
  });
});
