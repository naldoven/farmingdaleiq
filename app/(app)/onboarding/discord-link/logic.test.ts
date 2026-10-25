import { describe, expect, it } from "vitest";

import {
  buildDiscordTestPing,
  needsDiscordLink,
  testPingSourceEventId,
} from "./logic";

const USER = "11111111-1111-4111-8111-111111111111";

describe("needsDiscordLink", () => {
  it("shows the step when no id is stored and nothing was skipped", () => {
    expect(
      needsDiscordLink({ discordUserId: null, skipCookieValue: undefined, userId: USER }),
    ).toBe(true);
  });

  it("hides the step once a real numeric id is stored", () => {
    expect(
      needsDiscordLink({
        discordUserId: "123456789012345678",
        skipCookieValue: undefined,
        userId: USER,
      }),
    ).toBe(false);
  });

  it("treats a non-numeric stored value as unlinked", () => {
    expect(
      needsDiscordLink({ discordUserId: "jamie", skipCookieValue: undefined, userId: USER }),
    ).toBe(true);
  });

  it("hides the step when this user skipped it", () => {
    expect(
      needsDiscordLink({ discordUserId: null, skipCookieValue: USER, userId: USER }),
    ).toBe(false);
  });

  it("ignores a skip cookie left by a different user on the same device", () => {
    expect(
      needsDiscordLink({ discordUserId: null, skipCookieValue: "someone-else", userId: USER }),
    ).toBe(true);
  });
});

describe("testPingSourceEventId", () => {
  it("is stable within one minute so a double tap queues one message", () => {
    const a = testPingSourceEventId(USER, new Date("2026-10-25T10:00:05Z"));
    const b = testPingSourceEventId(USER, new Date("2026-10-25T10:00:55Z"));
    expect(a).toBe(b);
  });

  it("changes in the next minute so a deliberate retry is possible", () => {
    const a = testPingSourceEventId(USER, new Date("2026-10-25T10:00:05Z"));
    const b = testPingSourceEventId(USER, new Date("2026-10-25T10:01:05Z"));
    expect(a).not.toBe(b);
  });

  it("is scoped to the user", () => {
    const now = new Date("2026-10-25T10:00:05Z");
    expect(testPingSourceEventId(USER, now)).not.toBe(testPingSourceEventId("other", now));
  });
});

describe("buildDiscordTestPing", () => {
  it("mentions the person and re-allows only their own id", () => {
    const message = buildDiscordTestPing("123456789012345678");
    expect(message.content).toContain("<@123456789012345678>");
    expect(message.allowed_mentions).toEqual({ parse: [], users: ["123456789012345678"] });
  });
});
