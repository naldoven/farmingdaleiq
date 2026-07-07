import { describe, expect, it } from "vitest";

import {
  addShiftNoteSchema,
  assignPositionSchema,
  createSetupSchema,
  postSetupSchema,
  selectTopPerformerSchema,
} from "./validation";

describe("createSetupSchema", () => {
  it("accepts a valid date + nullable fields", () => {
    const result = createSetupSchema.safeParse({
      date: "2026-07-07",
      dayPartId: null,
      templateId: null,
      shiftLeaderId: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed date", () => {
    const result = createSetupSchema.safeParse({
      date: "07/07/2026",
      dayPartId: null,
      templateId: null,
      shiftLeaderId: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("assignPositionSchema", () => {
  it("allows unassigning (null userId)", () => {
    const result = assignPositionSchema.safeParse({
      setupId: "11111111-1111-4111-8111-111111111111",
      positionId: "22222222-2222-4222-8222-222222222222",
      userId: null,
      arrivalTime: "",
    });
    expect(result.success).toBe(true);
  });
});

describe("postSetupSchema", () => {
  it("requires a uuid id", () => {
    expect(postSetupSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });
});

describe("addShiftNoteSchema", () => {
  it("rejects an empty note body", () => {
    const result = addShiftNoteSchema.safeParse({
      setupId: "11111111-1111-4111-8111-111111111111",
      body: "   ",
    });
    expect(result.success).toBe(false);
  });
});

describe("selectTopPerformerSchema", () => {
  it("requires both ids", () => {
    const result = selectTopPerformerSchema.safeParse({
      setupId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
    });
    expect(result.success).toBe(true);
  });
});
