import { describe, expect, it } from "vitest";

import {
  planMaintenanceTaskSync,
  type ActiveWorkOrderRow,
  type ExistingMaintenanceTaskRow,
} from "./maintenance-sync";

const TODAY = "2026-08-05";

function wo(overrides: Partial<ActiveWorkOrderRow> = {}): ActiveWorkOrderRow {
  return { id: "wo-1", title: "Fix walk-in freezer", assigned_user_id: "user-a", ...overrides };
}

function existingTask(overrides: Partial<ExistingMaintenanceTaskRow> = {}): ExistingMaintenanceTaskRow {
  return { id: "task-1", status: "pending", assigned_user_id: "user-a", work_order_id: "wo-1", ...overrides };
}

describe("planMaintenanceTaskSync", () => {
  it("creates a task for a newly-assigned active work order with no existing task", () => {
    const plan = planMaintenanceTaskSync([wo()], [], TODAY);
    expect(plan.toInsert).toEqual([
      {
        kind: "maintenance",
        title: "Fix walk-in freezer",
        description: null,
        date: TODAY,
        assigned_user_id: "user-a",
        status: "pending",
        token_value: 0,
        ref: { source: "work_order_status", work_order_id: "wo-1" },
      },
    ]);
    expect(plan.toCancelIds).toEqual([]);
  });

  it("does nothing when a live pending task already exists for the right assignee", () => {
    const plan = planMaintenanceTaskSync([wo()], [existingTask()], TODAY);
    expect(plan.toInsert).toEqual([]);
    expect(plan.toCancelIds).toEqual([]);
  });

  it("cancels the old assignee's task and creates a fresh one when a work order is reassigned", () => {
    const plan = planMaintenanceTaskSync(
      [wo({ assigned_user_id: "user-b" })],
      [existingTask({ assigned_user_id: "user-a" })],
      TODAY,
    );
    expect(plan.toCancelIds).toEqual(["task-1"]);
    expect(plan.toInsert).toEqual([
      {
        kind: "maintenance",
        title: "Fix walk-in freezer",
        description: null,
        date: TODAY,
        assigned_user_id: "user-b",
        status: "pending",
        token_value: 0,
        ref: { source: "work_order_status", work_order_id: "wo-1" },
      },
    ]);
  });

  it("cancels a pending task whose work order is no longer active (e.g. completed)", () => {
    // Work order dropped out of the active set entirely (completed/cancelled).
    const plan = planMaintenanceTaskSync([], [existingTask()], TODAY);
    expect(plan.toCancelIds).toEqual(["task-1"]);
    expect(plan.toInsert).toEqual([]);
  });

  it("leaves an already-cancelled task alone rather than re-cancelling it", () => {
    const plan = planMaintenanceTaskSync([], [existingTask({ status: "cancelled" })], TODAY);
    expect(plan.toCancelIds).toEqual([]);
  });

  it("leaves a completed task alone even if its work order is no longer active", () => {
    const plan = planMaintenanceTaskSync([], [existingTask({ status: "completed" })], TODAY);
    expect(plan.toCancelIds).toEqual([]);
  });

  it("creates a fresh task when the only existing row for a still-active work order was already cancelled (reassigned back and forth same day)", () => {
    // wo-1 went A -> B (cancelling A's task) -> back to A within the same
    // day. Only the cancelled leftover from the A->B swap remains on record;
    // a live pending task for A must still be (re)created.
    const plan = planMaintenanceTaskSync(
      [wo({ assigned_user_id: "user-a" })],
      [existingTask({ status: "cancelled", assigned_user_id: "user-a" })],
      TODAY,
    );
    expect(plan.toInsert).toHaveLength(1);
    expect(plan.toInsert[0]).toMatchObject({ assigned_user_id: "user-a" });
    expect(plan.toCancelIds).toEqual([]);
  });

  it("excludes vendor-only or unassigned work orders entirely (caller's query filters them out)", () => {
    // planMaintenanceTaskSync trusts its activeWorkOrders input; the actual
    // filtering (assigned_user_id is not null) happens in the caller's
    // Supabase query (syncMaintenanceTasks), not here. An empty input simply
    // produces no inserts.
    const plan = planMaintenanceTaskSync([], [], TODAY);
    expect(plan).toEqual({ toInsert: [], toCancelIds: [] });
  });

  it("handles multiple work orders independently", () => {
    const plan = planMaintenanceTaskSync(
      [wo({ id: "wo-1", assigned_user_id: "user-a" }), wo({ id: "wo-2", title: "Ice machine leaking", assigned_user_id: "user-b" })],
      [existingTask({ id: "task-1", work_order_id: "wo-1", assigned_user_id: "user-a" })],
      TODAY,
    );
    expect(plan.toCancelIds).toEqual([]);
    expect(plan.toInsert).toEqual([
      {
        kind: "maintenance",
        title: "Ice machine leaking",
        description: null,
        date: TODAY,
        assigned_user_id: "user-b",
        status: "pending",
        token_value: 0,
        ref: { source: "work_order_status", work_order_id: "wo-2" },
      },
    ]);
  });
});
