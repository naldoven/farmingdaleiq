import { describe, expect, it } from "vitest";

import {
  countCompletedTasks,
  countOpenTasks,
  summarizeActiveAccountabilityPoints,
  summarizePassportProgress,
  summarizeTrainingProgress,
} from "./personal-record";

describe("countOpenTasks", () => {
  it("counts pending and overdue but not completed/cancelled", () => {
    const tasks = [
      { status: "pending" },
      { status: "overdue" },
      { status: "completed" },
      { status: "cancelled" },
    ];
    expect(countOpenTasks(tasks)).toBe(2);
  });

  it("returns 0 for an empty list", () => {
    expect(countOpenTasks([])).toBe(0);
  });
});

describe("countCompletedTasks", () => {
  it("counts only completed tasks", () => {
    const tasks = [
      { status: "completed" },
      { status: "completed" },
      { status: "pending" },
    ];
    expect(countCompletedTasks(tasks)).toBe(2);
  });
});

describe("summarizeActiveAccountabilityPoints", () => {
  const now = new Date("2026-07-08T00:00:00Z");

  it("sums points for infractions with no expiry", () => {
    const points = summarizeActiveAccountabilityPoints(
      [{ points: 10, expires_at: null }],
      now,
    );
    expect(points).toBe(10);
  });

  it("excludes expired infractions", () => {
    const points = summarizeActiveAccountabilityPoints(
      [
        { points: 10, expires_at: "2026-06-01T00:00:00Z" },
        { points: 4, expires_at: "2026-08-01T00:00:00Z" },
      ],
      now,
    );
    expect(points).toBe(4);
  });

  it("returns 0 when there are no infractions", () => {
    expect(summarizeActiveAccountabilityPoints([], now)).toBe(0);
  });
});

describe("summarizeTrainingProgress", () => {
  it("buckets enrollments by status", () => {
    const summary = summarizeTrainingProgress([
      { status: "active" },
      { status: "active" },
      { status: "graduated" },
      { status: "pip" },
    ]);
    expect(summary).toEqual({ active: 2, graduated: 1, pip: 1 });
  });

  it("returns all zeros for no enrollments", () => {
    expect(summarizeTrainingProgress([])).toEqual({ active: 0, graduated: 0, pip: 0 });
  });
});

describe("summarizePassportProgress", () => {
  it("splits stamped vs unstamped enrollments", () => {
    const summary = summarizePassportProgress([
      { stamped_at: "2026-01-01T00:00:00Z" },
      { stamped_at: null },
      { stamped_at: null },
    ]);
    expect(summary).toEqual({ completed: 1, inProgress: 2 });
  });
});
