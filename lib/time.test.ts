import { describe, expect, it } from "vitest";

import {
  addStoreCalendarDays,
  formatStoreDate,
  formatStoreDateTime,
  formatStoreDateTimeInput,
  formatStoreTime,
  storeDateTimeInputToIso,
  storeHour,
  storeLocalDate,
} from "./time";

describe("store time helpers", () => {
  it("formats summer instants in Eastern daylight time", () => {
    const value = "2026-08-07T20:33:00.000Z";

    expect(formatStoreDateTime(value)).toBe("Aug 7, 2026, 4:33 PM");
    expect(formatStoreTime(value)).toBe("4:33 PM");
    expect(storeHour(value)).toBe(16);
  });

  it("formats winter instants in Eastern standard time", () => {
    expect(formatStoreDateTime("2026-01-07T21:30:00.000Z")).toBe("Jan 7, 2026, 4:30 PM");
  });

  it("keeps timezone-free database dates on their intended store date", () => {
    expect(formatStoreDate("2026-08-07")).toBe("Aug 7, 2026");
  });

  it("uses the store calendar at both daylight-saving boundaries", () => {
    expect(storeLocalDate(new Date("2026-08-02T00:30:00.000Z"))).toBe("2026-08-01");
    expect(storeLocalDate(new Date("2026-01-01T03:30:00.000Z"))).toBe("2025-12-31");
  });

  it("adds calendar days without changing the intended date", () => {
    expect(addStoreCalendarDays("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("round-trips datetime-local values in the store timezone", () => {
    expect(formatStoreDateTimeInput("2026-08-07T20:33:00.000Z")).toBe("2026-08-07T16:33");
    expect(storeDateTimeInputToIso("2026-08-07T16:33")).toBe("2026-08-07T20:33:00.000Z");
  });
});
