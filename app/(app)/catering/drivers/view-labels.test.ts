import { describe, expect, it } from "vitest";

import { emptyOrdersMessage, tomorrowTabLabel } from "./view-labels";

describe("tomorrowTabLabel", () => {
  it("says Tomorrow on a weekday", () => {
    expect(tomorrowTabLabel("2026-10-28")).toBe("Tomorrow"); // Wednesday
    expect(tomorrowTabLabel("2026-10-30")).toBe("Tomorrow"); // Friday, Saturday is open
  });

  it("names Monday on Saturday, since Sunday is closed", () => {
    expect(tomorrowTabLabel("2026-10-31")).toBe("Monday");
  });

  it("says Tomorrow on Sunday, when Monday is the next day", () => {
    expect(tomorrowTabLabel("2026-11-01")).toBe("Tomorrow");
  });
});

describe("emptyOrdersMessage", () => {
  it("reads naturally for each tab", () => {
    expect(emptyOrdersMessage("today", "2026-10-28")).toBe("No delivery orders today.");
    expect(emptyOrdersMessage("tomorrow", "2026-10-28")).toBe("No delivery orders tomorrow.");
    expect(emptyOrdersMessage("week", "2026-10-28")).toBe("No delivery orders this week.");
  });

  it("names the day when Tomorrow skips Sunday", () => {
    expect(emptyOrdersMessage("tomorrow", "2026-10-31")).toBe("No delivery orders on Monday.");
  });
});
