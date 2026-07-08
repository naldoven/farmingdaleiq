import { describe, expect, it } from "vitest";

import { summarizeFeed, summarizePositions, summarizeTasks } from "./page";

describe("summarizePositions", () => {
  it("returns nothing when there are no assignments today", () => {
    expect(summarizePositions([], new Map(), new Map())).toEqual([]);
  });

  it("resolves position and day-part names for each assignment", () => {
    const assignments = [
      { position_id: "pos-1", setup_id: "setup-1" },
      { position_id: "pos-2", setup_id: "setup-2" },
    ];
    const positionNameById = new Map([
      ["pos-1", "Register"],
      ["pos-2", "Drive Thru"],
    ]);
    const dayPartNameBySetupId = new Map<string, string | null>([
      ["setup-1", "Breakfast"],
      ["setup-2", null],
    ]);

    expect(summarizePositions(assignments, positionNameById, dayPartNameBySetupId)).toEqual([
      { positionName: "Register", dayPartName: "Breakfast" },
      { positionName: "Drive Thru", dayPartName: null },
    ]);
  });

  it("drops assignments with a null position_id and falls back to a label for unknown positions", () => {
    const assignments = [
      { position_id: null, setup_id: "setup-1" },
      { position_id: "missing", setup_id: "setup-1" },
    ];

    expect(summarizePositions(assignments, new Map(), new Map())).toEqual([
      { positionName: "Unknown position", dayPartName: null },
    ]);
  });
});

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

describe("summarizeFeed", () => {
  it("builds a recipient headline for recognition/top_performer posts", () => {
    const posts = [
      {
        id: "post-1",
        kind: "recognition",
        body: "Great hustle today",
        author_id: "leader-1",
        subject_user_id: "employee-1",
        created_at: "2026-07-08T12:00:00Z",
      },
    ];
    const nameById = new Map([
      ["leader-1", "Jamie"],
      ["employee-1", "Alex"],
    ]);

    expect(summarizeFeed(posts, nameById)).toEqual([
      {
        id: "post-1",
        kind: "recognition",
        headline: "Jamie → Alex",
        body: "Great hustle today",
        createdAt: "2026-07-08T12:00:00Z",
      },
    ]);
  });

  it("uses only the author for a broadcast headline", () => {
    const posts = [
      {
        id: "post-2",
        kind: "broadcast",
        body: "Store closes early Friday",
        author_id: "leader-1",
        subject_user_id: null,
        created_at: "2026-07-08T12:00:00Z",
      },
    ];
    const nameById = new Map([["leader-1", "Jamie"]]);

    expect(summarizeFeed(posts, nameById)[0].headline).toBe("Jamie");
  });

  it("falls back to generic labels when names are unknown", () => {
    const posts = [
      {
        id: "post-3",
        kind: "recognition",
        body: null,
        author_id: null,
        subject_user_id: null,
        created_at: "2026-07-08T12:00:00Z",
      },
    ];

    expect(summarizeFeed(posts, new Map())[0].headline).toBe("Someone → a coworker");
  });
});
