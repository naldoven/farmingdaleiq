import { describe, expect, it } from "vitest";

import { claimRewardSchema, createRewardSchema, updateRewardSchema } from "@/app/(app)/rewards/validation";

describe("createRewardSchema", () => {
  it("accepts a valid reward with unlimited stock", () => {
    const result = createRewardSchema.safeParse({
      name: "Cookie/Brownie (TM)",
      tokenCost: 25,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stock).toBeNull();
      expect(result.data.active).toBe(true);
    }
  });

  it("normalizes an empty-string stock to null (unlimited)", () => {
    const result = createRewardSchema.safeParse({ name: "Drink Cup (TM)", tokenCost: 25, stock: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.stock).toBeNull();
  });

  it("accepts a finite stock count", () => {
    const result = createRewardSchema.safeParse({ name: "Treasure Box (TM)", tokenCost: 50, stock: 10 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.stock).toBe(10);
  });

  it("rejects a missing name", () => {
    expect(createRewardSchema.safeParse({ name: "", tokenCost: 25 }).success).toBe(false);
  });

  it("rejects a zero or negative token cost", () => {
    expect(createRewardSchema.safeParse({ name: "X", tokenCost: 0 }).success).toBe(false);
    expect(createRewardSchema.safeParse({ name: "X", tokenCost: -10 }).success).toBe(false);
  });

  it("rejects a negative stock", () => {
    expect(createRewardSchema.safeParse({ name: "X", tokenCost: 25, stock: -1 }).success).toBe(false);
  });
});

describe("updateRewardSchema", () => {
  it("requires a uuid id in addition to the create fields", () => {
    const result = updateRewardSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Medium Side (TM)",
      tokenCost: 50,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    expect(
      updateRewardSchema.safeParse({ id: "not-a-uuid", name: "X", tokenCost: 25 }).success
    ).toBe(false);
  });
});

describe("claimRewardSchema", () => {
  it("requires a uuid reward id", () => {
    expect(claimRewardSchema.safeParse({ rewardId: "11111111-1111-4111-8111-111111111111" }).success).toBe(true);
    expect(claimRewardSchema.safeParse({ rewardId: "nope" }).success).toBe(false);
  });
});
