import { describe, expect, it } from "vitest";

import {
  createPositionSchema,
  reorderPositionsSchema,
  setPositionRateableSchema,
} from "./validation";

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-8222-222222222222";

describe("setPositionRateableSchema", () => {
  it("accepts a uuid and a boolean", () => {
    expect(setPositionRateableSchema.safeParse({ id: UUID, isRateable: false }).success).toBe(true);
  });

  it("rejects a string where the boolean goes", () => {
    // z.boolean(), not z.coerce.boolean(): "false" would coerce to true and
    // silently flip a station the wrong way.
    expect(setPositionRateableSchema.safeParse({ id: UUID, isRateable: "false" }).success).toBe(false);
  });
});

describe("reorderPositionsSchema", () => {
  it("accepts a list of uuids", () => {
    expect(reorderPositionsSchema.safeParse({ orderedIds: [UUID, UUID2] }).success).toBe(true);
  });

  it("rejects an empty list and non-uuids", () => {
    expect(reorderPositionsSchema.safeParse({ orderedIds: [] }).success).toBe(false);
    expect(reorderPositionsSchema.safeParse({ orderedIds: ["register-1"] }).success).toBe(false);
  });
});

describe("shared position schemas", () => {
  it("trims the name and rejects a blank one", () => {
    expect(createPositionSchema.parse({ groupId: null, name: "  Register 1 " }).name).toBe("Register 1");
    expect(createPositionSchema.safeParse({ groupId: null, name: "   " }).success).toBe(false);
  });
});
