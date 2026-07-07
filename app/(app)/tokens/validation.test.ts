import { describe, expect, it } from "vitest";

import { giftTokensSchema, updateEarningRuleSchema } from "@/app/(app)/tokens/validation";

describe("giftTokensSchema", () => {
  it("accepts a valid gift", () => {
    const result = giftTokensSchema.safeParse({
      toUserId: "11111111-1111-4111-8111-111111111111",
      amount: 10,
      note: "Great job today",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid recipient", () => {
    const result = giftTokensSchema.safeParse({ toUserId: "not-a-uuid", amount: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects a zero or negative amount", () => {
    expect(giftTokensSchema.safeParse({ toUserId: "11111111-1111-4111-8111-111111111111", amount: 0 }).success).toBe(false);
    expect(giftTokensSchema.safeParse({ toUserId: "11111111-1111-4111-8111-111111111111", amount: -5 }).success).toBe(false);
  });

  it("rejects a fractional amount", () => {
    const result = giftTokensSchema.safeParse({ toUserId: "11111111-1111-4111-8111-111111111111", amount: 2.5 });
    expect(result.success).toBe(false);
  });

  it("allows an empty note", () => {
    const result = giftTokensSchema.safeParse({ toUserId: "11111111-1111-4111-8111-111111111111", amount: 5, note: "" });
    expect(result.success).toBe(true);
  });
});

describe("updateEarningRuleSchema", () => {
  it("accepts a zero amount (a rule can be turned off)", () => {
    expect(updateEarningRuleSchema.safeParse({ eventKey: "task_complete", amount: 0 }).success).toBe(true);
  });

  it("rejects a negative amount", () => {
    expect(updateEarningRuleSchema.safeParse({ eventKey: "task_complete", amount: -1 }).success).toBe(false);
  });

  it("rejects an empty event key", () => {
    expect(updateEarningRuleSchema.safeParse({ eventKey: "", amount: 5 }).success).toBe(false);
  });
});
