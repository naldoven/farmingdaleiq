import { describe, expect, it } from "vitest";

import { sessionHours, totalWeeklyHours, weekDates } from "./logic";

describe("sessionHours", () => {
  it("computes hours between start and end", () => {
    expect(sessionHours("09:00", "11:30")).toBe(2.5);
  });
  it("is 0 when either time is missing", () => {
    expect(sessionHours(null, "11:30")).toBe(0);
    expect(sessionHours("09:00", null)).toBe(0);
  });
  it("is 0 when end is not after start", () => {
    expect(sessionHours("11:00", "09:00")).toBe(0);
  });
});

describe("totalWeeklyHours", () => {
  it("sums multiple sessions", () => {
    const sessions = [
      { start_time: "09:00", end_time: "11:00" },
      { start_time: "13:00", end_time: "15:30" },
    ];
    expect(totalWeeklyHours(sessions)).toBe(4.5);
  });
});

describe("weekDates", () => {
  it("returns the Monday-start week for a Wednesday", () => {
    const wed = new Date("2026-07-08T12:00:00Z"); // a Wednesday
    const dates = weekDates(wed);
    expect(dates[0]).toBe("2026-07-06");
    expect(dates[6]).toBe("2026-07-12");
  });
  it("returns the Monday-start week for a Sunday", () => {
    const sun = new Date("2026-07-12T12:00:00Z");
    const dates = weekDates(sun);
    expect(dates[0]).toBe("2026-07-06");
  });
});
