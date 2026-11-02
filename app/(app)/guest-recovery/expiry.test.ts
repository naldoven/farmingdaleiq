import { describe, expect, it } from "vitest";

import { daysLeft, expiryLine, goodUntilLabel, isExpired } from "@/app/(app)/guest-recovery/expiry";

const NOW = new Date("2026-11-03T15:00:00.000Z");

describe("isExpired", () => {
  it("is false before the instant, true at and after it", () => {
    expect(isExpired("2026-11-03T15:00:01.000Z", NOW)).toBe(false);
    expect(isExpired("2026-11-03T15:00:00.000Z", NOW)).toBe(true);
    expect(isExpired("2026-10-01T00:00:00.000Z", NOW)).toBe(true);
  });

  it("never expires a row with no date", () => {
    expect(isExpired(null, NOW)).toBe(false);
    expect(isExpired(undefined, NOW)).toBe(false);
  });
});

describe("daysLeft", () => {
  it("rounds up so the last day still says 1", () => {
    expect(daysLeft("2026-11-04T14:00:00.000Z", NOW)).toBe(1);
    expect(daysLeft("2026-11-04T16:00:00.000Z", NOW)).toBe(2);
    expect(daysLeft("2027-02-01T15:00:00.000Z", NOW)).toBe(90);
  });

  it("is zero or negative once expired", () => {
    expect(daysLeft("2026-11-03T15:00:00.000Z", NOW)).toBe(0);
    expect(daysLeft("2026-11-01T15:00:00.000Z", NOW)).toBeLessThan(0);
  });
});

describe("labels", () => {
  it("writes the date in the store's time zone, not UTC", () => {
    // 2027-02-01 03:00 UTC is still Jan 31 in New York.
    expect(goodUntilLabel("2027-02-01T03:00:00.000Z")).toBe("Good until Jan 31, 2027");
  });

  it("says Expired for a past date and counts days for a live one", () => {
    expect(expiryLine("2026-10-01T15:00:00.000Z", NOW)).toBe("Expired Oct 1, 2026");
    expect(expiryLine("2026-11-04T14:00:00.000Z", NOW)).toBe("Good until Nov 4, 2026 (1 day left)");
    expect(expiryLine("2026-11-13T14:00:00.000Z", NOW)).toBe("Good until Nov 13, 2026 (10 days left)");
  });
});
