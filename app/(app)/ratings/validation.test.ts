import { describe, expect, it } from "vitest";

import { quickRateSchema, rubricRateSchema, resolveRerateSchema, upsertRubricSchema } from "./validation";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("quickRateSchema", () => {
  it("accepts a valid quick rate", () => {
    expect(quickRateSchema.safeParse({ userId: uuid, positionId: uuid, stars: 4, comment: "" }).success).toBe(true);
  });
  it("rejects stars above 5", () => {
    expect(quickRateSchema.safeParse({ userId: uuid, positionId: uuid, stars: 6 }).success).toBe(false);
  });
  it("rejects stars below 0", () => {
    expect(quickRateSchema.safeParse({ userId: uuid, positionId: uuid, stars: -1 }).success).toBe(false);
  });
});

describe("rubricRateSchema", () => {
  it("accepts nulls for unused categories", () => {
    const result = rubricRateSchema.safeParse({
      userId: uuid,
      positionId: uuid,
      category1: 5,
      category2: 4,
      category3: null,
      category4: null,
    });
    expect(result.success).toBe(true);
  });
  it("rejects a category above 5", () => {
    const result = rubricRateSchema.safeParse({
      userId: uuid,
      positionId: uuid,
      category1: 6,
      category2: null,
      category3: null,
      category4: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("resolveRerateSchema", () => {
  it("requires a uuid", () => {
    expect(resolveRerateSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
    expect(resolveRerateSchema.safeParse({ id: uuid }).success).toBe(true);
  });
});

describe("upsertRubricSchema", () => {
  it("allows all categories blank", () => {
    expect(
      upsertRubricSchema.safeParse({ positionId: uuid, category1: "", category2: "", category3: "", category4: "" })
        .success,
    ).toBe(true);
  });
});
