import { describe, expect, it } from "vitest";

import {
  countActiveDisciplinaryActions,
  summarizeActivity,
  summarizeCleaningToday,
  summarizeCompletion,
  summarizeStoreTrend,
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

describe("summarizeCleaningToday", () => {
  it("counts each half like the Today screen: skipped and sent-back cleans leave the count", () => {
    const rows = [
      { half: "am", status: "done", rejected_at: null },
      { half: "am", status: "not_needed", rejected_at: null },
      { half: "am", status: "planned", rejected_at: null },
      { half: "pm", status: "done", rejected_at: "2026-10-26T20:00:00Z" },
      { half: "pm", status: "skipped", rejected_at: null },
      { half: "pm", status: "planned", rejected_at: null },
    ];
    expect(summarizeCleaningToday(rows)).toEqual({
      am: { done: 2, total: 3 },
      pm: { done: 0, total: 1 },
    });
  });

  it("is empty on a day with no cleans", () => {
    expect(summarizeCleaningToday([])).toEqual({ am: { done: 0, total: 0 }, pm: { done: 0, total: 0 } });
  });
});

describe("summarizeStoreTrend", () => {
  const week = (week_start: string, owed: number, on_time: number, missed = 0) => ({ week_start, owed, on_time, missed });

  it("shows last week once it has ended, ignoring the week in progress", () => {
    // Wednesday Oct 28: Oct 19 week is over, Oct 26 has two closed days.
    const rows = [week("2026-10-19", 50, 46, 2), week("2026-10-26", 12, 6, 4)];
    expect(summarizeStoreTrend(rows, "2026-10-28")).toEqual({ pct: 92, weekLabel: "Oct 19", partial: false });
  });

  it("shows the current week so far when no week has ended yet, and says so", () => {
    // The module's first week: nothing older exists.
    expect(summarizeStoreTrend([week("2026-10-26", 10, 8, 1)], "2026-10-28")).toEqual({
      pct: 80,
      weekLabel: "Oct 26",
      partial: true,
    });
  });

  it("counts the week as ended on Sunday, once Saturday night is behind us", () => {
    expect(summarizeStoreTrend([week("2026-10-26", 36, 33, 3)], "2026-11-01")).toEqual({
      pct: 92,
      weekLabel: "Oct 26",
      partial: false,
    });
    // Still Saturday: the week is not over.
    expect(summarizeStoreTrend([week("2026-10-26", 30, 27, 3)], "2026-10-31")?.partial).toBe(true);
  });

  it("skips a finished week with nothing owed and falls back to the one before it", () => {
    const rows = [week("2026-10-12", 40, 38, 1), week("2026-10-19", 0, 0, 0), week("2026-10-26", 5, 5, 0)];
    expect(summarizeStoreTrend(rows, "2026-10-28")).toEqual({ pct: 95, weekLabel: "Oct 12", partial: false });
  });

  it("does not depend on the order the rows arrive in", () => {
    const rows = [week("2026-10-26", 12, 6, 4), week("2026-10-19", 50, 46, 2)];
    expect(summarizeStoreTrend(rows, "2026-10-28")?.weekLabel).toBe("Oct 19");
  });

  it("rounds like the stats page, and shows 0% as a real number", () => {
    expect(summarizeStoreTrend([week("2026-10-19", 3, 2)], "2026-10-28")?.pct).toBe(67);
    expect(summarizeStoreTrend([week("2026-10-19", 4, 0, 4)], "2026-10-28")?.pct).toBe(0);
  });

  it("hides the card when there is no history or nothing was owed", () => {
    expect(summarizeStoreTrend([], "2026-10-28")).toBeNull();
    expect(summarizeStoreTrend([week("2026-10-19", 0, 0)], "2026-10-28")).toBeNull();
  });
});
