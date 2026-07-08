import { describe, expect, it } from "vitest";

import {
  countActiveDisciplinaryActions,
  summarizeActivity,
  summarizeCompletion,
  summarizeTaskScope,
  summarizeTasks,
  summarizeTokenActivity,
} from "./page";

describe("summarizeTasks", () => {
  it("reports all caught up when there are no open tasks", () => {
    expect(summarizeTasks([])).toEqual({ openCount: 0, overdueCount: 0, titles: [] });
  });

  it("counts pending and overdue tasks as open, ignoring completed ones", () => {
    const tasks = [
      { title: "Wipe counters", status: "pending" },
      { title: "Restock cups", status: "overdue" },
      { title: "Sweep lobby", status: "completed" },
    ];

    expect(summarizeTasks(tasks)).toEqual({
      openCount: 2,
      overdueCount: 1,
      titles: ["Wipe counters", "Restock cups"],
    });
  });

  it("caps the title preview at 3 while openCount reflects the true total", () => {
    const tasks = Array.from({ length: 5 }, (_, i) => ({ title: `Task ${i}`, status: "pending" }));

    const summary = summarizeTasks(tasks);
    expect(summary.openCount).toBe(5);
    expect(summary.titles).toEqual(["Task 0", "Task 1", "Task 2"]);
  });
});

describe("summarizeCompletion", () => {
  it("returns a 0% zero-state when there are no items", () => {
    expect(summarizeCompletion([])).toEqual({ completed: 0, total: 0, pct: 0 });
  });

  it("computes x/y and a rounded percent completed", () => {
    expect(summarizeCompletion(["completed", "completed", "pending"])).toEqual({
      completed: 2,
      total: 3,
      pct: 67,
    });
  });

  it("accepts a custom completed status (checklist_runs uses the same shape)", () => {
    expect(summarizeCompletion(["missed", "completed"], "completed")).toEqual({
      completed: 1,
      total: 2,
      pct: 50,
    });
  });
});

describe("summarizeTaskScope", () => {
  it("reports zero assigned/overdue when the scope has no tasks", () => {
    expect(summarizeTaskScope([])).toEqual({ assigned: 0, overdue: 0 });
  });

  it("counts pending + overdue as assigned, and overdue as its own subset", () => {
    const tasks = [{ status: "pending" }, { status: "overdue" }, { status: "completed" }];

    expect(summarizeTaskScope(tasks)).toEqual({ assigned: 2, overdue: 1 });
  });
});

describe("countActiveDisciplinaryActions", () => {
  it("counts only pending (not yet acknowledged) actions", () => {
    const actions = [{ status: "pending" }, { status: "acknowledged" }, { status: "pending" }];

    expect(countActiveDisciplinaryActions(actions)).toBe(2);
  });

  it("returns 0 when there are no disciplinary actions", () => {
    expect(countActiveDisciplinaryActions([])).toBe(0);
  });
});

describe("summarizeActivity", () => {
  it("counts unread notifications and the priority subset of those", () => {
    const notifications = [
      { kind: "infraction_issued", read_at: null },
      { kind: "task_assigned", read_at: null },
      { kind: "recognition", read_at: "2026-07-08T00:00:00Z" },
    ];

    expect(summarizeActivity(notifications)).toEqual({ unreadCount: 2, priorityCount: 1 });
  });

  it("returns zero counts when everything is read", () => {
    const notifications = [{ kind: "infraction_issued", read_at: "2026-07-08T00:00:00Z" }];

    expect(summarizeActivity(notifications)).toEqual({ unreadCount: 0, priorityCount: 0 });
  });
});

describe("summarizeTokenActivity", () => {
  it("prefers the transaction note when present", () => {
    const rows = [{ id: "t1", delta: 5, kind: "earn", note: "Completed Task" }];

    expect(summarizeTokenActivity(rows)).toEqual([{ id: "t1", label: "Completed Task", delta: 5 }]);
  });

  it("falls back to the kind label when there is no note", () => {
    const rows = [{ id: "t2", delta: -10, kind: "redeem", note: null }];

    expect(summarizeTokenActivity(rows)).toEqual([{ id: "t2", label: "Reward redeemed", delta: -10 }]);
  });

  it("falls back to the kind label when the note is blank", () => {
    const rows = [{ id: "t3", delta: 5, kind: "earn", note: "   " }];

    expect(summarizeTokenActivity(rows)).toEqual([{ id: "t3", label: "Earned", delta: 5 }]);
  });
});
