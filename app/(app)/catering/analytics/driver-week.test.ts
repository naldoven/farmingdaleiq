import { describe, expect, it } from "vitest";

import { driverWeekHref, driverWeekTitle, resolveDriverWeek } from "./driver-week";

// Monday Oct 26 2026. The week is Mon Oct 26 to Sat Oct 31.
const TODAY = "2026-10-26";

describe("resolveDriverWeek", () => {
  it("defaults to the current week, with no next link", () => {
    expect(resolveDriverWeek(undefined, TODAY)).toEqual({
      range: { start: "2026-10-26", end: "2026-10-31" },
      prevDate: "2026-10-19",
      nextDate: null,
    });
  });

  it("accepts any date inside an earlier week and offers both neighbors", () => {
    expect(resolveDriverWeek("2026-10-15", TODAY)).toEqual({
      range: { start: "2026-10-12", end: "2026-10-17" },
      prevDate: "2026-10-05",
      nextDate: "2026-10-19",
    });
  });

  it("lets the week before the current one link forward to the current week", () => {
    const view = resolveDriverWeek("2026-10-20", TODAY);
    expect(view.range.start).toBe("2026-10-19");
    expect(view.nextDate).toBe("2026-10-26");
  });

  it("shows the week just ended on Sunday, matching driverWeekRange", () => {
    const view = resolveDriverWeek(undefined, "2026-11-01");
    expect(view.range).toEqual({ start: "2026-10-26", end: "2026-10-31" });
    expect(view.nextDate).toBeNull();
  });

  it("falls back to the current week for a future date", () => {
    expect(resolveDriverWeek("2026-12-01", TODAY).range.start).toBe("2026-10-26");
  });

  it.each(["", "garbage", "2026-13-40", "2026-02-30", "10/12/2026"])("falls back for %j", (value) => {
    expect(resolveDriverWeek(value, TODAY).range.start).toBe("2026-10-26");
  });
});

describe("driverWeekHref", () => {
  it("sets driverWeek on the analytics page", () => {
    expect(driverWeekHref({}, "2026-10-19")).toBe("/catering/analytics?driverWeek=2026-10-19");
  });

  it("replaces an existing driverWeek and keeps every other param, repeats included", () => {
    expect(driverWeekHref({ driverWeek: "2026-10-12", tab: "x", tag: ["a", "b"], skip: undefined }, "2026-10-19")).toBe(
      "/catering/analytics?tab=x&tag=a&tag=b&driverWeek=2026-10-19",
    );
  });
});

describe("driverWeekTitle", () => {
  it("reads 'Week of Oct 12 to Oct 17'", () => {
    expect(driverWeekTitle({ start: "2026-10-12", end: "2026-10-17" })).toBe("Week of Oct 12 to Oct 17");
  });

  it("handles a week that crosses a month", () => {
    expect(driverWeekTitle({ start: "2026-10-26", end: "2026-10-31" })).toBe("Week of Oct 26 to Oct 31");
    expect(driverWeekTitle({ start: "2026-10-27", end: "2026-11-01" })).toBe("Week of Oct 27 to Nov 1");
  });
});
