import { describe, expect, it } from "vitest";

import { summarizeBreaks, summarizeToDos, type DueSoonSource } from "@/app/(app)/team/dashboard-logic";

describe("summarizeToDos", () => {
  it("computes 0% with an empty empty state (no items)", () => {
    const summary = summarizeToDos([]);
    expect(summary).toEqual({
      totalCount: 0,
      completedCount: 0,
      percentComplete: 0,
      dueSoon: [],
      moreCount: 0,
    });
  });

  it("rounds completion percent from completed vs total", () => {
    const items: DueSoonSource[] = [
      { id: "1", kind: "task", title: "A", dueAt: null, completed: true },
      { id: "2", kind: "task", title: "B", dueAt: null, completed: false },
      { id: "3", kind: "checklist", title: "C", dueAt: null, completed: false },
    ];
    const summary = summarizeToDos(items);
    expect(summary.totalCount).toBe(3);
    expect(summary.completedCount).toBe(1);
    expect(summary.percentComplete).toBe(33);
  });

  it("sorts open items soonest-due first, undated items last", () => {
    const items: DueSoonSource[] = [
      { id: "no-due", kind: "task", title: "No due time", dueAt: null, completed: false },
      { id: "later", kind: "task", title: "Later", dueAt: "2026-07-08T14:00:00.000Z", completed: false },
      { id: "sooner", kind: "checklist", title: "Sooner", dueAt: "2026-07-08T09:00:00.000Z", completed: false },
      { id: "done", kind: "task", title: "Already done", dueAt: "2026-07-08T08:00:00.000Z", completed: true },
    ];
    const summary = summarizeToDos(items);
    expect(summary.dueSoon.map((i) => i.id)).toEqual(["sooner", "later", "no-due"]);
    // "done" is excluded from the open list entirely.
    expect(summary.dueSoon.some((i) => i.id === "done")).toBe(false);
  });

  it("caps the Due Soon list at `limit` and reports the remainder as moreCount", () => {
    const items: DueSoonSource[] = Array.from({ length: 6 }, (_, i) => ({
      id: `item-${i}`,
      kind: "task" as const,
      title: `Item ${i}`,
      dueAt: `2026-07-08T0${i}:00:00.000Z`,
      completed: false,
    }));
    const summary = summarizeToDos(items, 4);
    expect(summary.dueSoon).toHaveLength(4);
    expect(summary.moreCount).toBe(2);
  });
});

describe("summarizeBreaks", () => {
  const NOW = new Date("2026-07-08T12:00:00.000Z");

  it("returns all zeros for no breaks", () => {
    expect(summarizeBreaks([], NOW)).toEqual({ remaining: 0, completed: 0, nextHour: 0 });
  });

  it("counts remaining as anything not completed or missed", () => {
    const breaks = [
      { status: "pending", dueAt: null },
      { status: "authorized", dueAt: null },
      { status: "active", dueAt: null },
      { status: "overdue", dueAt: null },
      { status: "completed", dueAt: null },
      { status: "missed", dueAt: null },
    ];
    const summary = summarizeBreaks(breaks, NOW);
    expect(summary.remaining).toBe(4);
    expect(summary.completed).toBe(1);
  });

  it("counts a due time within the next hour, excluding closed breaks", () => {
    const breaks = [
      { status: "pending", dueAt: "2026-07-08T12:30:00.000Z" }, // in range
      { status: "authorized", dueAt: "2026-07-08T13:00:00.000Z" }, // exactly at the edge, in range
      { status: "pending", dueAt: "2026-07-08T14:00:00.000Z" }, // too far out
      { status: "completed", dueAt: "2026-07-08T12:15:00.000Z" }, // closed, excluded even though due soon
      { status: "pending", dueAt: null }, // no due time yet
    ];
    expect(summarizeBreaks(breaks, NOW).nextHour).toBe(2);
  });
});
