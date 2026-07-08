import { describe, expect, it } from "vitest";
import {
  addWorkOrderCommentSchema,
  approveRequestSchema,
  assignWorkOrderSchema,
  completeWorkOrderSchema,
  submitMaintenanceRequestSchema,
} from "./validation";

describe("submitMaintenanceRequestSchema", () => {
  it("requires a title", () => {
    const result = submitMaintenanceRequestSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a minimal valid request", () => {
    const result = submitMaintenanceRequestSchema.safeParse({ title: "Walk-in freezer leaking" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.photoUrls).toEqual([]);
    }
  });

  it("rejects an invalid suggested priority", () => {
    const result = submitMaintenanceRequestSchema.safeParse({
      title: "Fryer down",
      suggestedPriority: "asap",
    });
    expect(result.success).toBe(false);
  });
});

describe("approveRequestSchema", () => {
  it("requires a valid requestId and priority", () => {
    const result = approveRequestSchema.safeParse({
      requestId: "not-a-uuid",
      priority: "high",
    });
    expect(result.success).toBe(false);
  });

  it("allows approval with no assignee yet (assign later)", () => {
    const result = approveRequestSchema.safeParse({
      requestId: "00000000-0000-0000-0000-000000000000",
      priority: "medium",
    });
    expect(result.success).toBe(true);
  });
});

describe("completeWorkOrderSchema", () => {
  it("rejects a negative cost", () => {
    const result = completeWorkOrderSchema.safeParse({
      workOrderId: "00000000-0000-0000-0000-000000000000",
      cost: -5,
    });
    expect(result.success).toBe(false);
  });

  it("coerces a numeric-string cost", () => {
    const result = completeWorkOrderSchema.safeParse({
      workOrderId: "00000000-0000-0000-0000-000000000000",
      cost: "42.50",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cost).toBe(42.5);
    }
  });

  it("allows completing with no cost recorded", () => {
    const result = completeWorkOrderSchema.safeParse({
      workOrderId: "00000000-0000-0000-0000-000000000000",
    });
    expect(result.success).toBe(true);
  });
});

describe("assignWorkOrderSchema", () => {
  it("allows a bare reassignment with no Discord fields", () => {
    const result = assignWorkOrderSchema.safeParse({
      workOrderId: "00000000-0000-0000-0000-000000000000",
      assignedUserId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notifyDiscord).toBeUndefined();
    }
  });

  it("accepts opting a work order into per-instance Discord notify with a channel", () => {
    const result = assignWorkOrderSchema.safeParse({
      workOrderId: "00000000-0000-0000-0000-000000000000",
      notifyDiscord: true,
      discordChannelId: "00000000-0000-4000-8000-000000000002",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notifyDiscord).toBe(true);
      expect(result.data.discordChannelId).toBe("00000000-0000-4000-8000-000000000002");
    }
  });
});

describe("addWorkOrderCommentSchema", () => {
  it("rejects an empty comment with no body and no photo", () => {
    const result = addWorkOrderCommentSchema.safeParse({
      workOrderId: "00000000-0000-0000-0000-000000000000",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a photo-only comment", () => {
    const result = addWorkOrderCommentSchema.safeParse({
      workOrderId: "00000000-0000-0000-0000-000000000000",
      photoUrl: "https://example.com/before.jpg",
    });
    expect(result.success).toBe(true);
  });
});
