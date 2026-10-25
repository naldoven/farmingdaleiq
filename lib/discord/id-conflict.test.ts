import { describe, expect, it } from "vitest";

import { DISCORD_ID_TAKEN_MESSAGE, isUniqueViolation } from "@/lib/discord/id-conflict";

describe("isUniqueViolation", () => {
  it("is true only for SQLSTATE 23505", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "42501" })).toBe(false);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation({ code: null })).toBe(false);
    expect(isUniqueViolation({})).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });

  it("has the plain message the rollout asks for", () => {
    expect(DISCORD_ID_TAKEN_MESSAGE).toBe("That Discord ID is already linked to another person.");
  });
});
