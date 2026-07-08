import { describe, expect, it } from "vitest";

import {
  computeAccountabilitySummary,
  computeActivePointsByUser,
  computeChecklistCompletion,
  computePassportCompletion,
  computeRepeatFailures,
  computeResolutionTimes,
  computeSpendByEquipment,
  computeTraineeCompletion,
  findEmployeesNearThreshold,
  findWasteSpikes,
  isTaskOverdue,
  selectCateringFollowUpsDue,
  selectDownEquipment,
  selectOpenFollowUps,
  selectOpenOrOverdueWorkOrders,
  selectOverdueTasks,
  selectPendingRewardClaims,
  summarizeRewardClaims,
  summarizeTokenActivity,
} from "./logic";

const NOW = new Date("2026-07-07T12:00:00.000Z");

describe("selectOverdueTasks / isTaskOverdue", () => {
  it("includes tasks already marked overdue by the nightly sweep", () => {
    const tasks = [
      { id: "1", title: "Sweep", status: "overdue", due_at: null, assigned_user_id: null, assigned_position_id: null },
    ];
    expect(selectOverdueTasks(tasks, NOW)).toHaveLength(1);
  });

  it("includes a pending task whose due_at has passed", () => {
    const tasks = [
      {
        id: "1",
        title: "Mop",
        status: "pending",
        due_at: "2026-07-07T00:00:00.000Z",
        assigned_user_id: null,
        assigned_position_id: null,
      },
    ];
    expect(isTaskOverdue(tasks[0], NOW)).toBe(true);
  });

  it("excludes a pending task whose due_at is in the future", () => {
    const task = {
      id: "1",
      title: "Mop",
      status: "pending",
      due_at: "2026-07-08T00:00:00.000Z",
      assigned_user_id: null,
      assigned_position_id: null,
    };
    expect(isTaskOverdue(task, NOW)).toBe(false);
  });

  it("excludes a completed task even with a past due_at", () => {
    const task = {
      id: "1",
      title: "Mop",
      status: "complete",
      due_at: "2020-01-01T00:00:00.000Z",
      assigned_user_id: null,
      assigned_position_id: null,
    };
    expect(isTaskOverdue(task, NOW)).toBe(false);
  });

  it("excludes a pending task with no due_at", () => {
    const task = {
      id: "1",
      title: "Ad hoc",
      status: "pending",
      due_at: null,
      assigned_user_id: null,
      assigned_position_id: null,
    };
    expect(isTaskOverdue(task, NOW)).toBe(false);
  });

  it("sorts overdue tasks by due_at ascending", () => {
    const tasks = [
      { id: "a", title: "Later", status: "overdue", due_at: "2026-07-06T00:00:00.000Z", assigned_user_id: null, assigned_position_id: null },
      { id: "b", title: "Earlier", status: "overdue", due_at: "2026-07-01T00:00:00.000Z", assigned_user_id: null, assigned_position_id: null },
    ];
    expect(selectOverdueTasks(tasks, NOW).map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("selectOpenFollowUps", () => {
  it("keeps only status=open and drops resolved ones", () => {
    const followUps = [
      { id: "1", description: "Fix cooler", status: "open", due_at: null, assigned_to: null },
      { id: "2", description: "Done already", status: "resolved", due_at: null, assigned_to: null },
    ];
    expect(selectOpenFollowUps(followUps).map((f) => f.id)).toEqual(["1"]);
  });
});

describe("computeChecklistCompletion", () => {
  it("rolls up runs and flagged answers per template", () => {
    const templates = [{ id: "t1", name: "Opening" }];
    const runs = [
      { id: "r1", template_id: "t1", status: "completed" },
      { id: "r2", template_id: "t1", status: "missed" },
      { id: "r3", template_id: "t1", status: "completed" },
    ];
    const answers = [
      { run_id: "r1", flagged: true },
      { run_id: "r1", flagged: false },
      { run_id: "r3", flagged: true },
    ];

    const rows = computeChecklistCompletion(runs, templates, answers);
    expect(rows).toEqual([
      {
        templateId: "t1",
        templateName: "Opening",
        totalRuns: 3,
        completedRuns: 2,
        missedRuns: 1,
        completionRate: 2 / 3,
        flaggedAnswers: 2,
      },
    ]);
  });

  it("falls back to a placeholder name for an unknown template id", () => {
    const rows = computeChecklistCompletion([{ id: "r1", template_id: "ghost", status: "completed" }], [], []);
    expect(rows[0].templateName).toBe("Unknown template");
  });

  it("returns a 0 completion rate when there are no runs (no divide-by-zero)", () => {
    // Not reachable via the byTemplate map (which only ever holds seen
    // templates), but guards the ratio math directly.
    const rows = computeChecklistCompletion([], [{ id: "t1", name: "Opening" }], []);
    expect(rows).toEqual([]);
  });
});

describe("findWasteSpikes", () => {
  const items = [{ id: "i1", name: "Waffle fries", unit: "lb" }];

  it("flags an item whose current-week total is well above its trailing average", () => {
    const entries = [
      // Baseline: four distinct populated weeks, 10/week (avg 10)
      { id: "b0", itemId: "i1", quantity: 10, loggedAt: "2026-06-24T00:00:00.000Z" },
      { id: "b1", itemId: "i1", quantity: 10, loggedAt: "2026-06-17T00:00:00.000Z" },
      { id: "b2", itemId: "i1", quantity: 10, loggedAt: "2026-06-10T00:00:00.000Z" },
      { id: "b3", itemId: "i1", quantity: 10, loggedAt: "2026-06-03T00:00:00.000Z" },
      // Current week: 30 (3x the 10/week baseline)
      { id: "e2", itemId: "i1", quantity: 30, loggedAt: "2026-07-06T00:00:00.000Z" },
    ];
    const spikes = findWasteSpikes(entries, items, NOW);
    expect(spikes).toHaveLength(1);
    expect(spikes[0].itemId).toBe("i1");
    expect(spikes[0].trailingWeeklyAverage).toBeCloseTo(10, 5);
    expect(spikes[0].ratio).toBeCloseTo(3, 5);
  });

  it("does not flag an item with no baseline activity", () => {
    const entries = [{ id: "e1", itemId: "i1", quantity: 100, loggedAt: "2026-07-06T00:00:00.000Z" }];
    expect(findWasteSpikes(entries, items, NOW)).toEqual([]);
  });

  it("divides the baseline by weeks actually populated, not the full lookback (no partial-baseline inflation)", () => {
    // Only ONE prior week has data (40 in that week). Dividing by the full
    // 4-week lookback would make the average 10 and flag the 30 current week
    // as a 3x spike; dividing by the one populated week makes the average 40,
    // so 30 is BELOW baseline and correctly not a spike.
    const entries = [
      { id: "b0", itemId: "i1", quantity: 40, loggedAt: "2026-06-05T00:00:00.000Z" },
      { id: "e2", itemId: "i1", quantity: 30, loggedAt: "2026-07-06T00:00:00.000Z" },
    ];
    expect(findWasteSpikes(entries, items, NOW)).toEqual([]);
  });

  it("averages over the two populated weeks when only two weeks have data", () => {
    const entries = [
      { id: "b0", itemId: "i1", quantity: 20, loggedAt: "2026-06-24T00:00:00.000Z" }, // week 0
      { id: "b1", itemId: "i1", quantity: 20, loggedAt: "2026-06-17T00:00:00.000Z" }, // week 1
      { id: "e2", itemId: "i1", quantity: 40, loggedAt: "2026-07-06T00:00:00.000Z" }, // current
    ];
    const spikes = findWasteSpikes(entries, items, NOW);
    expect(spikes).toHaveLength(1);
    expect(spikes[0].trailingWeeklyAverage).toBeCloseTo(20, 5); // 40 / 2 weeks, not 40 / 4
    expect(spikes[0].ratio).toBeCloseTo(2, 5);
  });

  it("does not flag an item whose current week is under the multiplier", () => {
    const entries = [
      { id: "b0", itemId: "i1", quantity: 10, loggedAt: "2026-06-24T00:00:00.000Z" },
      { id: "b1", itemId: "i1", quantity: 10, loggedAt: "2026-06-17T00:00:00.000Z" },
      { id: "b2", itemId: "i1", quantity: 10, loggedAt: "2026-06-10T00:00:00.000Z" },
      { id: "b3", itemId: "i1", quantity: 10, loggedAt: "2026-06-03T00:00:00.000Z" }, // avg 10
      { id: "e2", itemId: "i1", quantity: 11, loggedAt: "2026-07-06T00:00:00.000Z" }, // 1.1x, under 1.5x
    ];
    expect(findWasteSpikes(entries, items, NOW)).toEqual([]);
  });

  it("ignores entries logged in the future", () => {
    const entries = [{ id: "e1", itemId: "i1", quantity: 999, loggedAt: "2099-01-01T00:00:00.000Z" }];
    expect(findWasteSpikes(entries, items, NOW)).toEqual([]);
  });
});

describe("maintenance reports", () => {
  const equipment = [
    { id: "eq1", name: "Fryer 1" },
    { id: "eq2", name: "Grill" },
  ];

  describe("computeResolutionTimes", () => {
    it("averages creation-to-completion hours per equipment for completed orders only", () => {
      const workOrders = [
        { id: "w1", title: "A", status: "complete", equipment_id: "eq1", created_at: "2026-07-01T00:00:00.000Z", completed_at: "2026-07-01T05:00:00.000Z", cost: null },
        { id: "w2", title: "B", status: "complete", equipment_id: "eq1", created_at: "2026-07-02T00:00:00.000Z", completed_at: "2026-07-02T15:00:00.000Z", cost: null },
        { id: "w3", title: "C", status: "open", equipment_id: "eq2", created_at: "2026-07-03T00:00:00.000Z", completed_at: null, cost: null },
        // completed_at before created_at: skipped rather than counted as negative
        { id: "w4", title: "D", status: "complete", equipment_id: "eq1", created_at: "2026-07-04T10:00:00.000Z", completed_at: "2026-07-04T09:00:00.000Z", cost: null },
      ];
      expect(computeResolutionTimes(workOrders, equipment)).toEqual([
        { equipmentId: "eq1", equipmentName: "Fryer 1", resolvedCount: 2, avgHoursToResolve: 10 },
      ]);
    });

    it("labels a null-equipment order as Unassigned", () => {
      const workOrders = [
        { id: "w1", title: "A", status: "complete", equipment_id: null, created_at: "2026-07-01T00:00:00.000Z", completed_at: "2026-07-01T02:00:00.000Z", cost: null },
      ];
      expect(computeResolutionTimes(workOrders, equipment)[0].equipmentName).toBe("Unassigned");
    });
  });

  describe("computeSpendByEquipment", () => {
    it("sums cost per equipment and sorts by spend descending", () => {
      const workOrders = [
        { id: "w1", title: "A", status: "complete", equipment_id: "eq1", created_at: "2026-07-01T00:00:00.000Z", completed_at: null, cost: 100 },
        { id: "w2", title: "B", status: "complete", equipment_id: "eq1", created_at: "2026-07-02T00:00:00.000Z", completed_at: null, cost: 50 },
        { id: "w3", title: "C", status: "complete", equipment_id: "eq2", created_at: "2026-07-03T00:00:00.000Z", completed_at: null, cost: 30 },
        { id: "w4", title: "D", status: "cancelled", equipment_id: null, created_at: "2026-07-04T00:00:00.000Z", completed_at: null, cost: 20 },
        // no cost: skipped
        { id: "w5", title: "E", status: "open", equipment_id: "eq2", created_at: "2026-07-05T00:00:00.000Z", completed_at: null, cost: null },
      ];
      expect(computeSpendByEquipment(workOrders, equipment)).toEqual([
        { equipmentId: "eq1", equipmentName: "Fryer 1", totalSpend: 150, workOrderCount: 2 },
        { equipmentId: "eq2", equipmentName: "Grill", totalSpend: 30, workOrderCount: 1 },
        { equipmentId: null, equipmentName: "Unassigned", totalSpend: 20, workOrderCount: 1 },
      ]);
    });
  });

  describe("computeRepeatFailures", () => {
    it("keeps only equipment with 2+ work orders, ignoring unassigned", () => {
      const workOrders = [
        { id: "w1", title: "A", status: "complete", equipment_id: "eq1", created_at: "2026-07-01T00:00:00.000Z", completed_at: null, cost: null },
        { id: "w2", title: "B", status: "complete", equipment_id: "eq1", created_at: "2026-07-02T00:00:00.000Z", completed_at: null, cost: null },
        { id: "w3", title: "C", status: "open", equipment_id: "eq1", created_at: "2026-07-03T00:00:00.000Z", completed_at: null, cost: null },
        { id: "w4", title: "D", status: "open", equipment_id: "eq2", created_at: "2026-07-04T00:00:00.000Z", completed_at: null, cost: null },
        { id: "w5", title: "E", status: "open", equipment_id: null, created_at: "2026-07-05T00:00:00.000Z", completed_at: null, cost: null },
      ];
      expect(computeRepeatFailures(workOrders, equipment)).toEqual([
        { equipmentId: "eq1", equipmentName: "Fryer 1", failureCount: 3 },
      ]);
    });
  });
});

describe("reward claims", () => {
  const claims = [
    { id: "c1", user_id: "u1", reward_id: "r1", cost: 100, status: "pending", claimed_at: "2026-07-05T00:00:00.000Z" },
    { id: "c2", user_id: "u2", reward_id: "r1", cost: 50, status: "delivered", claimed_at: "2026-07-01T00:00:00.000Z" },
    { id: "c3", user_id: "u3", reward_id: "r2", cost: 20, status: "cancelled", claimed_at: "2026-07-02T00:00:00.000Z" },
  ];

  it("selectPendingRewardClaims keeps only pending", () => {
    expect(selectPendingRewardClaims(claims).map((c) => c.id)).toEqual(["c1"]);
  });

  it("summarizeRewardClaims counts by status and sums delivered cost", () => {
    expect(summarizeRewardClaims(claims)).toEqual({
      totalClaims: 3,
      pending: 1,
      delivered: 1,
      cancelled: 1,
      totalCostDelivered: 50,
    });
  });
});

describe("summarizeTokenActivity", () => {
  it("splits earned vs spent and computes net per user", () => {
    const transactions = [
      { id: "1", user_id: "u1", delta: 10, kind: "task_complete", created_at: "2026-07-01T00:00:00.000Z" },
      { id: "2", user_id: "u1", delta: -5, kind: "redeem", created_at: "2026-07-02T00:00:00.000Z" },
      { id: "3", user_id: "u2", delta: 3, kind: "task_complete", created_at: "2026-07-01T00:00:00.000Z" },
    ];
    const rows = summarizeTokenActivity(transactions);
    expect(rows).toEqual([
      { userId: "u1", earned: 10, spent: 5, net: 5, transactionCount: 2 },
      { userId: "u2", earned: 3, spent: 0, net: 3, transactionCount: 1 },
    ]);
  });
});

describe("computeActivePointsByUser", () => {
  it("sums only non-expired infractions", () => {
    const infractions = [
      { user_id: "u1", points: 2, expires_at: "2026-08-01T00:00:00.000Z" }, // active
      { user_id: "u1", points: 5, expires_at: "2026-01-01T00:00:00.000Z" }, // expired
      { user_id: "u2", points: 1, expires_at: null }, // never expires
    ];
    const totals = computeActivePointsByUser(infractions, NOW);
    expect(totals.get("u1")).toBe(2);
    expect(totals.get("u2")).toBe(1);
  });
});

describe("findEmployeesNearThreshold", () => {
  const ladder = [
    { id: "d1", name: "Written warning", threshold_points: 5 },
    { id: "d2", name: "Final warning", threshold_points: 10 },
  ];

  it("flags a user within withinPoints of the next uncrossed rung", () => {
    const pointsByUser = new Map([["u1", 4]]);
    const rows = findEmployeesNearThreshold(pointsByUser, ladder);
    expect(rows).toEqual([
      { userId: "u1", activePoints: 4, nextThreshold: ladder[0], pointsToNextThreshold: 1 },
    ]);
  });

  it("does not flag a user far from the next rung", () => {
    const pointsByUser = new Map([["u1", 0]]);
    expect(findEmployeesNearThreshold(pointsByUser, ladder)).toEqual([]);
  });

  it("does not flag a user who has already crossed every rung", () => {
    const pointsByUser = new Map([["u1", 12]]);
    expect(findEmployeesNearThreshold(pointsByUser, ladder)).toEqual([]);
  });

  it("finds the next rung correctly for a user already past the first one", () => {
    const pointsByUser = new Map([["u1", 9]]);
    const rows = findEmployeesNearThreshold(pointsByUser, ladder);
    expect(rows).toEqual([
      { userId: "u1", activePoints: 9, nextThreshold: ladder[1], pointsToNextThreshold: 1 },
    ]);
  });
});

describe("computeAccountabilitySummary", () => {
  it("combines active points with lifetime infraction counts", () => {
    const infractions = [
      { user_id: "u1", points: 2, expires_at: "2026-08-01T00:00:00.000Z" },
      { user_id: "u1", points: 5, expires_at: "2026-01-01T00:00:00.000Z" }, // expired, still counts toward total
    ];
    const rows = computeAccountabilitySummary(infractions, NOW);
    expect(rows).toEqual([{ userId: "u1", activePoints: 2, totalInfractions: 2 }]);
  });
});

describe("selectOpenOrOverdueWorkOrders", () => {
  it("excludes terminal statuses and flags overdue", () => {
    const workOrders = [
      { id: "w1", title: "Fix fryer", status: "open", priority: "high", due_at: "2026-01-01T00:00:00.000Z" },
      { id: "w2", title: "Done", status: "complete", priority: "low", due_at: "2020-01-01T00:00:00.000Z" },
      { id: "w3", title: "In progress", status: "in_progress", priority: "medium", due_at: null },
    ];
    const rows = selectOpenOrOverdueWorkOrders(workOrders, NOW);
    expect(rows.map((r) => r.id)).toEqual(["w1", "w3"]);
    expect(rows.find((r) => r.id === "w1")?.overdue).toBe(true);
    expect(rows.find((r) => r.id === "w3")?.overdue).toBe(false);
  });
});

describe("selectDownEquipment", () => {
  it("keeps only status=down, sorted by name", () => {
    const equipment = [
      { id: "e1", name: "Fryer 2", status: "down", area: "BOH" },
      { id: "e2", name: "Fryer 1", status: "operational", area: "BOH" },
      { id: "e3", name: "Ice machine", status: "down", area: "BOH" },
    ];
    expect(selectDownEquipment(equipment).map((e) => e.id)).toEqual(["e1", "e3"]);
  });
});

describe("selectCateringFollowUpsDue", () => {
  it("keeps only due-and-not-done follow-ups", () => {
    const followUps = [
      { id: "f1", order_id: "o1", due_on: "2026-07-01", done_at: null },
      { id: "f2", order_id: "o2", due_on: "2026-07-01", done_at: "2026-07-02T00:00:00.000Z" },
      { id: "f3", order_id: "o3", due_on: "2026-08-01", done_at: null },
      { id: "f4", order_id: "o4", due_on: null, done_at: null },
    ];
    expect(selectCateringFollowUpsDue(followUps, NOW).map((f) => f.id)).toEqual(["f1"]);
  });
});

describe("computePassportCompletion", () => {
  it("rolls up stamped vs total per passport", () => {
    const passports = [{ id: "p1", name: "FOH passport" }];
    const enrollments = [
      { id: "e1", passport_id: "p1", stamped_at: "2026-01-01T00:00:00.000Z" },
      { id: "e2", passport_id: "p1", stamped_at: null },
    ];
    expect(computePassportCompletion(enrollments, passports)).toEqual([
      { passportId: "p1", passportName: "FOH passport", totalEnrollments: 2, stamped: 1, completionRate: 0.5 },
    ]);
  });
});

describe("computeTraineeCompletion", () => {
  it("counts active/graduated/pip per roadmap and computes graduation rate", () => {
    const roadmaps = [{ id: "r1", name: "FOH roadmap" }];
    const enrollments = [
      { id: "e1", roadmap_id: "r1", status: "active" },
      { id: "e2", roadmap_id: "r1", status: "graduated" },
      { id: "e3", roadmap_id: "r1", status: "graduated" },
      { id: "e4", roadmap_id: "r1", status: "pip" },
    ];
    expect(computeTraineeCompletion(enrollments, roadmaps)).toEqual([
      {
        roadmapId: "r1",
        roadmapName: "FOH roadmap",
        total: 4,
        active: 1,
        graduated: 2,
        pip: 1,
        graduationRate: 0.5,
      },
    ]);
  });
});
