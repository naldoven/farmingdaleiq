import { describe, expect, it } from "vitest";

import { markNotificationReadSchema, savePushSubscriptionSchema } from "./validation";

describe("markNotificationReadSchema", () => {
  it("accepts a valid uuid", () => {
    expect(
      markNotificationReadSchema.safeParse({ id: "11111111-1111-4111-8111-111111111111" }).success,
    ).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    expect(markNotificationReadSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });
});

describe("savePushSubscriptionSchema", () => {
  const base = { endpoint: "https://push.example/abc", p256dh: "key1", auth: "key2" };

  it("accepts a fully populated subscription", () => {
    expect(savePushSubscriptionSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a blank endpoint", () => {
    expect(savePushSubscriptionSchema.safeParse({ ...base, endpoint: "" }).success).toBe(false);
  });

  it("rejects a missing auth key", () => {
    const rest: Partial<typeof base> = { ...base };
    delete rest.auth;
    expect(savePushSubscriptionSchema.safeParse(rest).success).toBe(false);
  });
});
