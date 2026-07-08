import { describe, expect, it } from "vitest";

import { groupBreakComplianceByKey, summarizeBreakCompliance } from "./compliance";

describe("summarizeBreakCompliance", () => {
  it("counts each status independently", () => {
    const summary = summarizeBreakCompliance([
      { status: "pending" },
      { status: "pending" },
      { status: "authorized" },
      { status: "active" },
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
      { status: "overdue" },
      { status: "missed" },
    ]);
    expect(summary).toEqual({
      total: 9,
      pending: 2,
      authorized: 1,
      active: 1,
      completed: 3,
      overdue: 1,
      missed: 1,
    });
  });

  it("returns all zeros for an empty range", () => {
    expect(summarizeBreakCompliance([])).toEqual({
      total: 0,
      pending: 0,
      authorized: 0,
      active: 0,
      completed: 0,
      overdue: 0,
      missed: 0,
    });
  });

  it("still counts an unrecognized status in total without crashing", () => {
    const summary = summarizeBreakCompliance([{ status: "bogus" }]);
    expect(summary.total).toBe(1);
    expect(summary.pending).toBe(0);
  });
});

describe("groupBreakComplianceByKey", () => {
  it("groups and summarizes per key, sorted by key", () => {
    const rows = [
      { status: "completed", date: "2026-07-02" },
      { status: "pending", date: "2026-07-01" },
      { status: "missed", date: "2026-07-01" },
    ];
    const grouped = groupBreakComplianceByKey(rows, (r) => r.date);
    expect(grouped.map((g) => g.key)).toEqual(["2026-07-01", "2026-07-02"]);
    expect(grouped[0].summary.pending).toBe(1);
    expect(grouped[0].summary.missed).toBe(1);
    expect(grouped[1].summary.completed).toBe(1);
  });
});
