import { describe, expect, it } from "vitest";

import { resolveAssigneeLabel } from "./task-list";

/**
 * T3: the manager "All Tasks Today" view must show who each task is assigned
 * to. resolveAssigneeLabel is the pure mapping app/(app)/tasks/page.tsx uses to
 * turn a task's assignee ids into a display label.
 */
describe("resolveAssigneeLabel", () => {
  const userNameById = new Map([["u1", "Jamie Rivera"]]);
  const positionNameById = new Map([["p1", "Line Cook"]]);

  it("resolves a person assignment to the person's name", () => {
    expect(
      resolveAssigneeLabel({
        assignedUserId: "u1",
        assignedPositionId: null,
        userNameById,
        positionNameById,
      }),
    ).toBe("Jamie Rivera");
  });

  it("resolves a position assignment to the position's name", () => {
    expect(
      resolveAssigneeLabel({
        assignedUserId: null,
        assignedPositionId: "p1",
        userNameById,
        positionNameById,
      }),
    ).toBe("Line Cook");
  });

  it("prefers the person over a position when both are set", () => {
    expect(
      resolveAssigneeLabel({
        assignedUserId: "u1",
        assignedPositionId: "p1",
        userNameById,
        positionNameById,
      }),
    ).toBe("Jamie Rivera");
  });

  it("returns null for an unassigned (pool) task", () => {
    expect(
      resolveAssigneeLabel({
        assignedUserId: null,
        assignedPositionId: null,
        userNameById,
        positionNameById,
      }),
    ).toBeNull();
  });

  it("falls back to a placeholder when the id has no matching name", () => {
    expect(
      resolveAssigneeLabel({
        assignedUserId: "u-missing",
        assignedPositionId: null,
        userNameById,
        positionNameById,
      }),
    ).toBe("Unknown person");
    expect(
      resolveAssigneeLabel({
        assignedUserId: null,
        assignedPositionId: "p-missing",
        userNameById,
        positionNameById,
      }),
    ).toBe("Unknown position");
  });
});
