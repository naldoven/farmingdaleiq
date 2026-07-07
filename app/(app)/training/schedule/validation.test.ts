import { describe, expect, it } from "vitest";

import { createSessionSchema, deleteSessionSchema } from "./validation";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("createSessionSchema", () => {
  it("accepts a minimal valid session", () => {
    expect(createSessionSchema.safeParse({ enrollmentId: uuid, date: "2026-07-10" }).success).toBe(true);
  });
  it("requires a date", () => {
    expect(createSessionSchema.safeParse({ enrollmentId: uuid, date: "" }).success).toBe(false);
  });
  it("defaults tags to an empty array", () => {
    const result = createSessionSchema.parse({ enrollmentId: uuid, date: "2026-07-10" });
    expect(result.tags).toEqual([]);
  });
});

describe("deleteSessionSchema", () => {
  it("requires a uuid", () => {
    expect(deleteSessionSchema.safeParse({ id: uuid }).success).toBe(true);
    expect(deleteSessionSchema.safeParse({ id: "x" }).success).toBe(false);
  });
});
