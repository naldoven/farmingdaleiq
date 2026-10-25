import { describe, expect, it } from "vitest";

import { DISCORD_USER_ID_PATTERN, isDiscordUserId } from "./user-id";

describe("isDiscordUserId", () => {
  it("accepts numeric ids from 15 to 25 digits", () => {
    expect(isDiscordUserId("1".repeat(15))).toBe(true);
    expect(isDiscordUserId("123456789012345678")).toBe(true);
    expect(isDiscordUserId("1".repeat(25))).toBe(true);
  });

  it("rejects usernames, short or long numbers, and padded text", () => {
    for (const value of ["jamie", "1".repeat(14), "1".repeat(26), " 123456789012345678", "<@123456789012345678>", ""]) {
      expect(isDiscordUserId(value)).toBe(false);
    }
  });

  it("rejects null and undefined", () => {
    expect(isDiscordUserId(null)).toBe(false);
    expect(isDiscordUserId(undefined)).toBe(false);
  });

  it("exposes the same pattern the helper uses", () => {
    expect(DISCORD_USER_ID_PATTERN.test("123456789012345678")).toBe(true);
  });
});
