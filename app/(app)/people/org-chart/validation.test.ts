import { describe, expect, it } from "vitest";

import { assignSlotSchema, createSlotSchema, createTierSchema } from "./validation";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("createTierSchema", () => {
  it("accepts a valid tier", () => {
    expect(createTierSchema.safeParse({ department: "foh", name: "Team Leaders", goalCount: 3 }).success).toBe(true);
  });
  it("rejects an unknown department", () => {
    expect(createTierSchema.safeParse({ department: "space", name: "x" }).success).toBe(false);
  });
});

describe("createSlotSchema", () => {
  it("allows a blank label", () => {
    expect(createSlotSchema.safeParse({ tierId: uuid, label: "" }).success).toBe(true);
  });
});

describe("assignSlotSchema", () => {
  it("allows a null userId to vacate a slot", () => {
    expect(assignSlotSchema.safeParse({ slotId: uuid, userId: null }).success).toBe(true);
  });
});
