import { describe, expect, it } from "vitest";

import {
  createChannelSchema,
  setEventRouteSchema,
  updateChannelSchema,
} from "./validation";

describe("createChannelSchema", () => {
  const base = {
    name: "Leaders",
    webhookUrl: "https://discord.com/api/webhooks/123/abc",
    purpose: "Overdue alerts",
  };

  it("accepts a valid Discord webhook URL", () => {
    expect(createChannelSchema.safeParse(base).success).toBe(true);
  });

  it("accepts the discordapp.com legacy host", () => {
    expect(
      createChannelSchema.safeParse({
        ...base,
        webhookUrl: "https://discordapp.com/api/webhooks/123/abc",
      }).success,
    ).toBe(true);
  });

  it("rejects a non-Discord webhook URL", () => {
    expect(
      createChannelSchema.safeParse({ ...base, webhookUrl: "https://evil.example/steal" }).success,
    ).toBe(false);
  });

  it("rejects a blank name", () => {
    expect(createChannelSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });
});

describe("updateChannelSchema", () => {
  it("allows a partial update (just toggling active)", () => {
    const result = updateChannelSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      active: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid replacement webhook URL", () => {
    const result = updateChannelSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      webhookUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

describe("setEventRouteSchema", () => {
  it("allows a null channelId (unrouting an event)", () => {
    const result = setEventRouteSchema.safeParse({
      eventKey: "maint_request",
      channelId: null,
      enabled: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid channelId", () => {
    const result = setEventRouteSchema.safeParse({
      eventKey: "maint_request",
      channelId: "leaders-channel",
      enabled: true,
    });
    expect(result.success).toBe(false);
  });
});
