import { describe, expect, it } from "vitest";

import {
  claimTaskSchema,
  completeTaskSchema,
  createTaskSchema,
  createTaskTemplateSchema,
  delegateTaskSchema,
  setTaskTemplateActiveSchema,
} from "./validation";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("createTaskSchema", () => {
  it("accepts a minimal ad hoc task with no assignment (pool)", () => {
    const result = createTaskSchema.safeParse({
      title: "Wipe down lobby tables",
      date: "2026-07-10",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assignedUserId).toBeNull();
      expect(result.data.assignedPositionId).toBeNull();
      expect(result.data.tokenValue).toBe(0);
    }
  });

  it("rejects a blank title", () => {
    expect(
      createTaskSchema.safeParse({ title: "   ", date: "2026-07-10" }).success,
    ).toBe(false);
  });

  it("normalizes empty-string optional fields to null", () => {
    const result = createTaskSchema.safeParse({
      title: "Restock cups",
      date: "2026-07-10",
      dayPartId: "",
      assignedUserId: "",
      assignedPositionId: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dayPartId).toBeNull();
      expect(result.data.assignedUserId).toBeNull();
    }
  });
});

describe("createTaskTemplateSchema", () => {
  it("accepts a daily template with no days of week", () => {
    const result = createTaskTemplateSchema.safeParse({
      title: "Stock napkins",
      frequency: "daily",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.daysOfWeek).toBeNull();
    }
  });

  it("requires at least one day of week for a weekly template", () => {
    const result = createTaskTemplateSchema.safeParse({
      title: "Deep clean lemonade machine",
      frequency: "weekly",
      daysOfWeek: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a weekly template with days of week set", () => {
    const result = createTaskTemplateSchema.safeParse({
      title: "Deep clean lemonade machine",
      frequency: "weekly",
      daysOfWeek: [2, 4, 6],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.daysOfWeek).toEqual([2, 4, 6]);
    }
  });
});

describe("setTaskTemplateActiveSchema", () => {
  it("requires a valid uuid id", () => {
    expect(
      setTaskTemplateActiveSchema.safeParse({ id: "not-a-uuid", active: false })
        .success,
    ).toBe(false);
  });

  it("accepts a valid toggle", () => {
    expect(
      setTaskTemplateActiveSchema.safeParse({ id: UUID_A, active: false }).success,
    ).toBe(true);
  });
});

describe("completeTaskSchema / claimTaskSchema", () => {
  it("require a uuid id", () => {
    expect(completeTaskSchema.safeParse({ id: UUID_A }).success).toBe(true);
    expect(completeTaskSchema.safeParse({ id: "nope" }).success).toBe(false);
    expect(claimTaskSchema.safeParse({ id: UUID_A }).success).toBe(true);
    expect(claimTaskSchema.safeParse({ id: "nope" }).success).toBe(false);
  });
});

describe("delegateTaskSchema", () => {
  it("rejects when neither user nor position is set", () => {
    expect(delegateTaskSchema.safeParse({ id: UUID_A }).success).toBe(false);
  });

  it("rejects when both user and position are set", () => {
    expect(
      delegateTaskSchema.safeParse({
        id: UUID_A,
        assignedUserId: UUID_B,
        assignedPositionId: UUID_B,
      }).success,
    ).toBe(false);
  });

  it("accepts exactly one of user or position", () => {
    expect(
      delegateTaskSchema.safeParse({ id: UUID_A, assignedUserId: UUID_B }).success,
    ).toBe(true);
    expect(
      delegateTaskSchema.safeParse({ id: UUID_A, assignedPositionId: UUID_B })
        .success,
    ).toBe(true);
  });
});
