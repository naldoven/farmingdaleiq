import { describe, expect, it } from "vitest";

import { linkMyDiscordIdSchema } from "./validation";

describe("linkMyDiscordIdSchema", () => {
  it("accepts a numeric snowflake and trims whitespace", () => {
    const parsed = linkMyDiscordIdSchema.parse({ discordUserId: " 123456789012345678 " });
    expect(parsed.discordUserId).toBe("123456789012345678");
  });

  it("rejects a username", () => {
    expect(() => linkMyDiscordIdSchema.parse({ discordUserId: "jamie" })).toThrow();
  });

  it("rejects an empty value", () => {
    expect(() => linkMyDiscordIdSchema.parse({ discordUserId: "" })).toThrow();
  });

  it("rejects a number that is too short to be a Discord id", () => {
    expect(() => linkMyDiscordIdSchema.parse({ discordUserId: "12345" })).toThrow();
  });
});
