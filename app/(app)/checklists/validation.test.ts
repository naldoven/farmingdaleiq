import { describe, expect, it } from "vitest";

import { answerInputSchema, assignRunSchema, followUpIdSchema, runIdSchema, saveAnswersSchema } from "./validation";

describe("answerInputSchema", () => {
  const base = {
    questionId: "11111111-1111-4111-8111-111111111111",
    value: 37,
    isNa: false,
    manuallyFlagged: false,
  };

  it("accepts a numeric answer", () => {
    expect(answerInputSchema.safeParse(base).success).toBe(true);
  });

  it("accepts a boolean answer (yes_no)", () => {
    expect(answerInputSchema.safeParse({ ...base, value: true }).success).toBe(true);
  });

  it("accepts a string answer (text/multi_choice)", () => {
    expect(answerInputSchema.safeParse({ ...base, value: "Clean" }).success).toBe(true);
  });

  it("accepts a null value alongside isNa", () => {
    expect(answerInputSchema.safeParse({ ...base, value: null, isNa: true }).success).toBe(true);
  });

  it("rejects a non-uuid questionId", () => {
    expect(answerInputSchema.safeParse({ ...base, questionId: "nope" }).success).toBe(false);
  });
});

describe("saveAnswersSchema", () => {
  it("rejects an empty answers array", () => {
    const result = saveAnswersSchema.safeParse({
      runId: "11111111-1111-4111-8111-111111111111",
      answers: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a run with at least one answer", () => {
    const result = saveAnswersSchema.safeParse({
      runId: "11111111-1111-4111-8111-111111111111",
      answers: [
        {
          questionId: "22222222-2222-4222-8222-222222222222",
          value: true,
          isNa: false,
          manuallyFlagged: false,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("runIdSchema / followUpIdSchema", () => {
  it("rejects a non-uuid runId", () => {
    expect(runIdSchema.safeParse({ runId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a non-uuid followUpId", () => {
    expect(followUpIdSchema.safeParse({ followUpId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("assignRunSchema", () => {
  const runId = "11111111-1111-4111-8111-111111111111";
  const userId = "22222222-2222-4222-8222-222222222222";

  it("accepts a run + user delegation", () => {
    expect(assignRunSchema.safeParse({ runId, userId }).success).toBe(true);
  });

  it("accepts a null userId (return to pool)", () => {
    expect(assignRunSchema.safeParse({ runId, userId: null }).success).toBe(true);
  });

  it("rejects a non-uuid userId", () => {
    expect(assignRunSchema.safeParse({ runId, userId: "nope" }).success).toBe(false);
  });
});
