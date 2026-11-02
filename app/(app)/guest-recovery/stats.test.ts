import { describe, expect, it } from "vitest";

import { buildGuestRecoveryReport, type ReportRow } from "./stats";

const DAY_PARTS = [
  { name: "Morning", start_time: "06:00:00", end_time: "11:00:00", sort: 1 },
  { name: "Lunch", start_time: "11:00:00", end_time: "14:00:00", sort: 2 },
  { name: "Dinner", start_time: "16:00:00", end_time: "20:00:00", sort: 3 },
];
const NOW = new Date("2026-11-20T17:00:00Z");
const BASE = Date.parse("2026-11-04T17:00:00Z"); // Wed 12:00 New York

let n = 0;
function row(over: Partial<ReportRow> = {}): ReportRow {
  n += 1;
  return {
    id: `r${n}`,
    status: "owed",
    createdAt: "2026-11-04T17:00:00Z",
    givenAt: null,
    loggedBy: "u1",
    loggedByName: "Ann",
    items: [{ family: "Nuggets", qty: 1 }],
    reason: null,
    firstSendAt: null,
    emailSent: false,
    smsSent: false,
    ...over,
  };
}
const run = (rows: ReportRow[], month = "2026-11", repeat?: { recoveries: number; guests: number } | null) =>
  buildGuestRecoveryReport(rows, { month, now: NOW, dayParts: DAY_PARTS, repeat });
const afterMin = (min: number) => new Date(BASE + min * 60000).toISOString();

describe("buildGuestRecoveryReport", () => {
  it("empty month gives zeros and nulls, no NaN", () => {
    const r = run([]);
    expect(r.recoveries).toBe(0);
    expect(r.pickedUpPct).toBeNull();
    expect(r.typicalSendMinutes).toBeNull();
    expect(r.typicalPickupDays).toBeNull();
    expect(r.followThrough.sendable).toBe(0);
    expect(r.byDaypart.every((d) => d.count === 0)).toBe(true);
    expect(r.byDaypart.some((d) => d.name === "Other hours")).toBe(false);
    expect(JSON.stringify(r)).not.toContain("NaN");
  });

  it("counts recoveries, last month, and a 6 month series ending at the month", () => {
    const r = run([row(), row(), row({ createdAt: "2026-10-10T16:00:00Z" })]);
    expect(r.recoveries).toBe(2);
    expect(r.lastMonthRecoveries).toBe(1);
    expect(r.byMonth.map((m) => m.month)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(r.byMonth[4].count).toBe(1);
    expect(r.byMonth[5].count).toBe(2);
  });

  it("puts 11:59 PM Dec 31 New York time in December", () => {
    const late = row({ createdAt: "2027-01-01T04:59:00Z" });
    expect(run([late], "2026-12").recoveries).toBe(1);
    expect(run([late], "2027-01").recoveries).toBe(0);
  });

  it("computes picked up percent excluding void", () => {
    const r = run([
      row({ status: "given", givenAt: afterMin(60) }),
      row(),
      row(),
      row({ status: "void" }),
    ]);
    expect(r.pickedUpPct).toBe(33);
    expect(r.stillOwed).toBe(2);
    expect(r.voided).toBe(1);
    expect(r.recoveries).toBe(4);
  });

  it("only voided rows gives null percent", () => {
    expect(run([row({ status: "void" })]).pickedUpPct).toBeNull();
  });

  it("median send minutes, odd and even counts", () => {
    expect(
      run([row({ firstSendAt: afterMin(2) }), row({ firstSendAt: afterMin(10) }), row({ firstSendAt: afterMin(40) })])
        .typicalSendMinutes,
    ).toBe(10);
    expect(
      run([
        row({ firstSendAt: afterMin(2) }),
        row({ firstSendAt: afterMin(10) }),
        row({ firstSendAt: afterMin(20) }),
        row({ firstSendAt: afterMin(40) }),
      ]).typicalSendMinutes,
    ).toBe(15);
  });

  it("void rows are ignored in send timing", () => {
    const r = run([row({ status: "void", firstSendAt: afterMin(1) }), row({ firstSendAt: afterMin(30) })]);
    expect(r.typicalSendMinutes).toBe(30);
  });

  it("median pickup days, even count", () => {
    const given = (days: number) => row({ status: "given", givenAt: afterMin(days * 1440) });
    expect(run([given(1), given(4)]).typicalPickupDays).toBe(2.5);
    expect(run([row()]).typicalPickupDays).toBeNull();
  });

  it("groups missing items by family, once per recovery, sorted", () => {
    const r = run([
      row({
        items: [
          { family: "Mac & Cheese", qty: 1 },
          { family: "Mac & Cheese", qty: 2 },
          { family: "Nuggets", qty: 3 },
        ],
      }),
      row({ items: [{ family: "Mac & Cheese", qty: 1 }] }),
      row({ items: [{ family: "Fries", qty: 1 }] }),
    ]);
    expect(r.totalRecoveries).toBe(3);
    expect(r.missingItems).toEqual([
      { family: "Mac & Cheese", recoveries: 2 },
      { family: "Fries", recoveries: 1 },
      { family: "Nuggets", recoveries: 1 },
    ]);
  });

  it("buckets day parts and weekdays in store time, Other hours only if used", () => {
    const r = run([
      row({ createdAt: "2026-11-04T17:00:00Z" }), // Wed 12:00 Lunch
      row({ createdAt: "2026-11-02T13:00:00Z" }), // Mon 08:00 Morning
      row({ createdAt: "2026-11-08T07:00:00Z" }), // Sun 02:00 Other
    ]);
    expect(r.byDaypart).toEqual([
      { name: "Morning", count: 1 },
      { name: "Lunch", count: 1 },
      { name: "Dinner", count: 0 },
      { name: "Other hours", count: 1 },
    ]);
    expect(r.byWeekday.map((d) => d.count)).toEqual([1, 0, 1, 0, 0, 0, 1]);
    expect(r.byWeekday[0].day).toBe("Mon");
  });

  it("ranks who logged", () => {
    const r = run([row({ loggedBy: "u2", loggedByName: "Bo" }), row(), row()]);
    expect(r.loggedBy).toEqual([
      { name: "Ann", count: 2 },
      { name: "Bo", count: 1 },
    ]);
  });

  it("follow-through counts, void excluded", () => {
    const f = run([
      row({ firstSendAt: afterMin(5), emailSent: true }),
      row({ firstSendAt: afterMin(45), emailSent: true, smsSent: true }),
      row(),
      row({ status: "void", emailSent: true, firstSendAt: afterMin(1) }),
    ]).followThrough;
    expect(f.emailed).toBe(2);
    expect(f.texted).toBe(1);
    expect(f.sentWithin15Min).toBe(1);
    expect(f.sendable).toBe(3);
    expect(f.notSent).toBe(1);
    expect(f.stillOwed).toBe(3);
  });

  it("over seven days spans months and ignores given and void", () => {
    const r = run([
      row({ createdAt: "2026-09-20T16:00:00Z" }),
      row({ createdAt: "2026-10-20T16:00:00Z" }),
      row({ createdAt: "2026-11-18T16:00:00Z" }), // 2 days old
      row({ createdAt: "2026-09-21T16:00:00Z", status: "given", givenAt: "2026-09-22T16:00:00Z" }),
      row({ createdAt: "2026-09-22T16:00:00Z", status: "void" }),
    ]);
    expect(r.followThrough.owedOverSevenDays).toBe(2);
    expect(r.followThrough.stillOwed).toBe(1);
  });

  it("groups reasons, counts nulls as Not recorded, sorts by count then label", () => {
    const r = run([
      row({ reason: "wrong_item" }),
      row({ reason: "missing_item" }),
      row({ reason: "missing_item" }),
      row({ reason: "quality" }),
      row({ reason: null }),
      row({ reason: null }),
      row({ reason: "missing_item", status: "void" }),
      row({ reason: "too_slow", createdAt: "2026-10-10T16:00:00Z" }), // other month
    ]);
    expect(r.reasons).toEqual([
      { reason: "missing_item", label: "Missing item", recoveries: 3 },
      { reason: "none", label: "Not recorded", recoveries: 2 },
      { reason: "quality", label: "Quality problem", recoveries: 1 },
      { reason: "wrong_item", label: "Wrong item", recoveries: 1 },
    ]);
  });

  it("reasons are empty for an empty month and use store time for the month edge", () => {
    expect(run([]).reasons).toEqual([]);
    const late = row({ createdAt: "2027-01-01T04:59:00Z", reason: "other" });
    expect(run([late], "2026-12").reasons).toEqual([{ reason: "other", label: "Other", recoveries: 1 }]);
    expect(run([late], "2027-01").reasons).toEqual([]);
  });

  it("passes repeat guests through, or null when not supplied", () => {
    expect(run([], "2026-11", { recoveries: 4, guests: 2 }).repeatGuests).toEqual({ recoveries: 4, guests: 2 });
    expect(run([]).repeatGuests).toBeNull();
    expect(run([], "2026-11", null).repeatGuests).toBeNull();
  });
});
