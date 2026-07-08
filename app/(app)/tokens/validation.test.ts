import { describe, expect, it } from "vitest";

import { adjustTokensSchema, giftTokensSchema, updateEarningRuleSchema } from "@/app/(app)/tokens/validation";

const UUID = "11111111-1111-4111-8111-111111111111";

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

describe("adjustTokensSchema", () => {
  it("accepts a positive credit and a negative debit", () => {
    expect(adjustTokensSchema.safeParse({ userId: UUID, delta: 15 }).success).toBe(true);
    expect(adjustTokensSchema.safeParse({ userId: UUID, delta: -15, note: "clawback" }).success).toBe(true);
  });

  it("rejects a zero adjustment", () => {
    expect(adjustTokensSchema.safeParse({ userId: UUID, delta: 0 }).success).toBe(false);
  });

  it("rejects a fractional adjustment", () => {
    expect(adjustTokensSchema.safeParse({ userId: UUID, delta: 2.5 }).success).toBe(false);
  });

  it("rejects an out-of-range adjustment", () => {
    expect(adjustTokensSchema.safeParse({ userId: UUID, delta: 1_000_001 }).success).toBe(false);
  });

  it("rejects a non-uuid user", () => {
    expect(adjustTokensSchema.safeParse({ userId: "nope", delta: 5 }).success).toBe(false);
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
