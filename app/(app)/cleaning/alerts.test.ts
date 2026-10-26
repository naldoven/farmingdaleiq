import { describe, expect, it } from "vitest";

import {
  buildDailySummary,
  buildMissesNotice,
  buildPlanReminder,
  buildWeekPublished,
  isPlanReminderTime,
  summaryDayFor,
  type SummaryRow,
} from "@/app/(app)/cleaning/alerts";

const MON = "2026-10-26";

function row(over: Partial<SummaryRow>): SummaryRow {
  return {
    status: "done",
    rejected: false,
    ownerless: false,
    itemName: "Mop sink",
    zoneName: "Dish to door",
    half: "pm",
    ...over,
  };
}

describe("summaryDayFor", () => {
  it("summarizes yesterday when it was an open day", () => {
    expect(summaryDayFor("2026-10-27")).toBe(MON);
    expect(summaryDayFor("2026-11-01")).toBe("2026-10-31");
  });

  it("has nothing to summarize on Monday, since Sunday is closed", () => {
    expect(summaryDayFor("2026-11-02")).toBeNull();
  });
});

describe("buildDailySummary", () => {
  it("returns nothing for a day with no cleans", () => {
    expect(buildDailySummary({ date: MON, rows: [], carriedOver: 0 })).toBeNull();
  });

  it("counts done, missed and carried over, and lists the missed items by name and area", () => {
    const summary = buildDailySummary({
      date: MON,
      rows: [
        row({ status: "done" }),
        row({ status: "not_needed", itemName: "Dumpster pad scrub", zoneName: "Dumpster", half: "am" }),
        row({ status: "missed", itemName: "Air vents", zoneName: "Machines", half: "am" }),
        row({ status: "missed", itemName: "Boil out primary", zoneName: "Boards", half: "pm" }),
      ],
      carriedOver: 2,
    })!;
    expect(summary.title).toBe("Cleaning, Mon Oct 26");
    expect(summary.counts).toEqual({ planned: 4, done: 2, missed: 2, skipped: 0, redo: 0, carriedOver: 2, noOwner: 0 });
    expect(summary.message).toBe(
      "2 of 4 done. 2 missed, 2 carried over. Missed: Air vents (Machines, AM); Boil out primary (Boards, PM).",
    );
  });

  it("says so plainly when everything got done", () => {
    const summary = buildDailySummary({ date: MON, rows: [row({}), row({ itemName: "Freezer" })], carriedOver: 0 })!;
    expect(summary.message).toBe("2 of 2 done. Nothing missed.");
  });

  it("leaves skipped and sent-back cleans out of the total, like the Today screen", () => {
    // The sent-back clean's redo is its own row on the next shift; counting
    // both would count one job twice.
    const summary = buildDailySummary({
      date: MON,
      rows: [row({}), row({ status: "skipped" }), row({ status: "done", rejected: true })],
      carriedOver: 0,
    })!;
    expect(summary.counts).toMatchObject({ planned: 1, done: 1, skipped: 1, redo: 1 });
    expect(summary.message).toBe("1 of 1 done. 1 sent back for a redo. 1 skipped. Nothing missed.");
  });

  it("calls out misses no Setup leader owned, as a count only", () => {
    const summary = buildDailySummary({
      date: MON,
      rows: [row({ status: "missed", ownerless: true }), row({ status: "missed", itemName: "Freezer" })],
      carriedOver: 2,
    })!;
    expect(summary.counts.noOwner).toBe(1);
    expect(summary.message.endsWith("1 of them had no Setup leader posted.")).toBe(true);
  });

  it("caps a long missed list so the post stays readable", () => {
    const rows = Array.from({ length: 14 }, (_, i) => row({ status: "missed", itemName: `Item ${i}` }));
    const summary = buildDailySummary({ date: MON, rows, carriedOver: 0 })!;
    expect(summary.message).toContain("Item 9 (Dish to door, PM)");
    expect(summary.message).not.toContain("Item 10 (");
    expect(summary.message.endsWith("and 4 more.")).toBe(true);
  });

  it("never names a person: it carries item and area names only", () => {
    const summary = buildDailySummary({ date: MON, rows: [row({ status: "missed" })], carriedOver: 1 })!;
    expect(Object.keys(summary).sort()).toEqual(["counts", "date", "dateLabel", "message", "missedText", "title"]);
  });
});

describe("buildMissesNotice", () => {
  it("is only sent when something was missed", () => {
    const clean = buildDailySummary({ date: MON, rows: [row({})], carriedOver: 0 })!;
    expect(buildMissesNotice(clean)).toBeNull();
  });

  it("points the coordinator at the week the misses happened in", () => {
    const summary = buildDailySummary({
      date: MON,
      rows: [row({ status: "missed", itemName: "Air vents", zoneName: "Machines", half: "am" })],
      carriedOver: 1,
    })!;
    expect(buildMissesNotice(summary)).toEqual({
      title: "1 clean missed on Mon Oct 26",
      body: "Air vents (Machines, AM). 1 carried over to the next open day.",
      link: "/cleaning/week?week=2026-10-26",
    });
  });

  it("links Saturday's misses to Saturday's week, not the coming one", () => {
    const summary = buildDailySummary({ date: "2026-10-31", rows: [row({ status: "missed" })], carriedOver: 1 })!;
    expect(buildMissesNotice(summary)?.link).toBe("/cleaning/week?week=2026-10-26");
  });

  it("tells the coordinator when nobody owned a miss", () => {
    const summary = buildDailySummary({
      date: MON,
      rows: [row({ status: "missed", ownerless: true })],
      carriedOver: 1,
    })!;
    expect(buildMissesNotice(summary)?.body).toBe(
      "Mop sink (Dish to door, PM). 1 carried over to the next open day. 1 had no Setup leader posted.",
    );
  });
});

describe("buildWeekPublished", () => {
  it("lists the rotating cleans in day and half order", () => {
    const post = buildWeekPublished({
      weekStart: MON,
      rows: [
        { date: "2026-10-28", half: "pm", itemName: "Hood filters", zoneName: "Machines", kind: "variable" },
        { date: MON, half: "am", itemName: "Freezer", zoneName: "Dish to door", kind: "constant" },
        { date: "2026-10-27", half: "am", itemName: "Rack 2", zoneName: "Prep", kind: "variable" },
      ],
    });
    expect(post.title).toBe("Cleaning week of Oct 26 is live");
    expect(post.message).toBe(
      "3 cleans planned. Rotating this week: Tue AM Rack 2 (Prep); Wed PM Hood filters (Machines).",
    );
  });

  it("says when the week has only the fixed cleans", () => {
    const post = buildWeekPublished({
      weekStart: MON,
      rows: [{ date: MON, half: "am", itemName: "Freezer", zoneName: "Dish to door", kind: "constant" }],
    });
    expect(post.message).toBe("1 clean planned. No rotating cleans this week.");
  });
});

describe("plan reminder", () => {
  it("goes out Saturday from 10am", () => {
    expect(isPlanReminderTime("2026-10-31", "09:59:59")).toBe(false);
    expect(isPlanReminderTime("2026-10-31", "10:00:00")).toBe(true);
    expect(isPlanReminderTime("2026-10-30", "18:00:00")).toBe(false);
  });

  it("summarizes next week for the coordinator", () => {
    expect(buildPlanReminder({ nextWeekStart: "2026-11-02", built: true, planned: 38, dueNotPlaced: 3 })).toEqual({
      title: "Plan next week's cleaning",
      body: "Week of Nov 2: 38 cleans planned, 3 due but not placed. It goes live Monday.",
      link: "/cleaning/week?week=2026-11-02",
    });
    expect(buildPlanReminder({ nextWeekStart: "2026-11-02", built: true, planned: 38, dueNotPlaced: 0 }).body).toBe(
      "Week of Nov 2: 38 cleans planned. It goes live Monday.",
    );
  });

  it("asks for a build when next week has no board yet", () => {
    expect(buildPlanReminder({ nextWeekStart: "2026-11-02", built: false, planned: 0, dueNotPlaced: 0 }).body).toBe(
      "Next week's board isn't built yet. Open the week board and tap Build now.",
    );
  });
});
