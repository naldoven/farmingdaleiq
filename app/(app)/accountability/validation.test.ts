import { describe, expect, it } from "vitest";

import {
  acknowledgeDisciplinaryActionSchema,
  issueInfractionSchema,
  updateAccountabilitySettingsSchema,
  upsertDisciplinaryActionTypeSchema,
  upsertInfractionTypeSchema,
} from "./validation";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("issueInfractionSchema", () => {
  it("accepts a valid input with a note", () => {
    const result = issueInfractionSchema.safeParse({
      userId: uuid,
      typeId: uuid,
      note: "Left the line unattended.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty note", () => {
    const result = issueInfractionSchema.safeParse({
      userId: uuid,
      typeId: uuid,
      note: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid userId", () => {
    const result = issueInfractionSchema.safeParse({
      userId: "not-a-uuid",
      typeId: uuid,
      note: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing typeId", () => {
    const result = issueInfractionSchema.safeParse({ userId: uuid, note: "" });
    expect(result.success).toBe(false);
  });
});

describe("acknowledgeDisciplinaryActionSchema", () => {
  it("accepts a valid id", () => {
    expect(acknowledgeDisciplinaryActionSchema.safeParse({ id: uuid }).success).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    expect(
      acknowledgeDisciplinaryActionSchema.safeParse({ id: "nope" }).success,
    ).toBe(false);
  });
});

describe("upsertInfractionTypeSchema", () => {
  it("accepts a new type (no id) with valid points", () => {
    const result = upsertInfractionTypeSchema.safeParse({
      name: "Late to Shift",
      points: 4,
      description: "",
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it("coerces a numeric string for points", () => {
    const result = upsertInfractionTypeSchema.safeParse({
      name: "Late to Shift",
      points: "4",
      description: "",
      active: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.points).toBe(4);
  });

  it("rejects negative points", () => {
    const result = upsertInfractionTypeSchema.safeParse({
      name: "Late to Shift",
      points: -1,
      description: "",
      active: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a blank name", () => {
    const result = upsertInfractionTypeSchema.safeParse({
      name: "  ",
      points: 4,
      description: "",
      active: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("upsertDisciplinaryActionTypeSchema", () => {
  it("accepts a valid ladder rung", () => {
    const result = upsertDisciplinaryActionTypeSchema.safeParse({
      name: "Verbal Warning",
      thresholdPoints: 15,
      description: "",
      sort: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero threshold", () => {
    const result = upsertDisciplinaryActionTypeSchema.safeParse({
      name: "Verbal Warning",
      thresholdPoints: 0,
      description: "",
      sort: 2,
    });
    expect(result.success).toBe(false);
  });

  it("defaults sort to 0 when omitted", () => {
    const result = upsertDisciplinaryActionTypeSchema.safeParse({
      name: "Verbal Warning",
      thresholdPoints: 15,
      description: "",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sort).toBe(0);
  });
});

describe("updateAccountabilitySettingsSchema", () => {
  it("accepts rolling with a positive period", () => {
    const result = updateAccountabilitySettingsSchema.safeParse({
      id: uuid,
      periodKind: "rolling",
      periodDays: 60,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown period kind", () => {
    const result = updateAccountabilitySettingsSchema.safeParse({
      id: uuid,
      periodKind: "quarterly",
      periodDays: 60,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a zero period length", () => {
    const result = updateAccountabilitySettingsSchema.safeParse({
      id: uuid,
      periodKind: "rolling",
      periodDays: 0,
    });
    expect(result.success).toBe(false);
  });
});
