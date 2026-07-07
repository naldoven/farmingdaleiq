import { describe, expect, it } from "vitest";

import {
  authorizeBreakSchema,
  completeBreakSchema,
  generateBreaksSchema,
  startBreakSchema,
} from "./validation";

describe("break action schemas", () => {
  const validId = "11111111-1111-4111-8111-111111111111";

  it("generateBreaksSchema requires a uuid setupId", () => {
    expect(generateBreaksSchema.safeParse({ setupId: validId }).success).toBe(true);
    expect(generateBreaksSchema.safeParse({ setupId: "nope" }).success).toBe(false);
  });

  it("authorizeBreakSchema requires a uuid id", () => {
    expect(authorizeBreakSchema.safeParse({ id: validId }).success).toBe(true);
    expect(authorizeBreakSchema.safeParse({ id: "nope" }).success).toBe(false);
  });

  it("startBreakSchema requires a uuid id", () => {
    expect(startBreakSchema.safeParse({ id: validId }).success).toBe(true);
  });

  it("completeBreakSchema requires a uuid id", () => {
    expect(completeBreakSchema.safeParse({ id: validId }).success).toBe(true);
  });
});
