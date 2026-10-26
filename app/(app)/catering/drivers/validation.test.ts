import { describe, expect, it } from "vitest";

import {
  escalationContactSchema,
  parseDriverView,
  saveDriverSchema,
  setDeliveryPlatformSchema,
  setOrderDriversSchema,
} from "@/app/(app)/catering/drivers/validation";

const ORDER = "33333333-3333-4333-8333-333333333333";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("setOrderDriversSchema", () => {
  it("accepts one or more distinct drivers, or none to clear", () => {
    expect(setOrderDriversSchema.safeParse({ orderId: ORDER, profileIds: [A, B] }).success).toBe(true);
    expect(setOrderDriversSchema.safeParse({ orderId: ORDER, profileIds: [] }).success).toBe(true);
  });

  it("rejects the same driver twice", () => {
    const result = setOrderDriversSchema.safeParse({ orderId: ORDER, profileIds: [A, A] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Pick each driver once.");
  });

  it("caps the drivers per order", () => {
    const ids = [1, 2, 3, 4, 5].map((n) => `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`);
    expect(setOrderDriversSchema.safeParse({ orderId: ORDER, profileIds: ids }).success).toBe(false);
  });

  it("rejects ids that are not uuids", () => {
    expect(setOrderDriversSchema.safeParse({ orderId: "x", profileIds: [A] }).success).toBe(false);
    expect(setOrderDriversSchema.safeParse({ orderId: ORDER, profileIds: ["x"] }).success).toBe(false);
  });
});

describe("other driver schemas", () => {
  it("only knows Roadway and ezCater", () => {
    expect(setDeliveryPlatformSchema.safeParse({ orderId: ORDER, platform: "ezcater" }).success).toBe(true);
    expect(setDeliveryPlatformSchema.safeParse({ orderId: ORDER, platform: "doordash" }).success).toBe(false);
  });

  it("takes a small or large car and the two app flags", () => {
    const base = { profileId: A, hasRoadwayApp: true, hasEzcaterApp: false, active: true };
    expect(saveDriverSchema.safeParse({ ...base, carSize: "large" }).success).toBe(true);
    expect(saveDriverSchema.safeParse({ ...base, carSize: "van" }).success).toBe(false);
  });

  it("allows clearing the escalation contact", () => {
    expect(escalationContactSchema.safeParse({ profileId: null }).success).toBe(true);
    expect(escalationContactSchema.safeParse({ profileId: A }).success).toBe(true);
  });

  it("falls back to Today for an unknown tab", () => {
    expect(parseDriverView("roster")).toBe("roster");
    expect(parseDriverView("nope")).toBe("today");
    expect(parseDriverView(undefined)).toBe("today");
  });
});
