import { describe, expect, it } from "vitest";

import {
  addTemplatePositionSchema,
  createPositionGroupSchema,
  createPositionSchema,
  createSetupTemplateSchema,
  hasSeedPositionGroups,
  moveTileSchema,
  upsertTileSchema,
} from "./validation";

describe("createPositionGroupSchema", () => {
  it("accepts a valid name", () => {
    expect(createPositionGroupSchema.safeParse({ name: "Kitchen" }).success).toBe(true);
  });

  it("rejects a blank name", () => {
    expect(createPositionGroupSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});

describe("createPositionSchema", () => {
  it("allows a null groupId (ungrouped position)", () => {
    const result = createPositionSchema.safeParse({ groupId: null, name: "Register 1" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid groupId", () => {
    const result = createPositionSchema.safeParse({ groupId: "kitchen", name: "Register 1" });
    expect(result.success).toBe(false);
  });
});

describe("createSetupTemplateSchema", () => {
  it("accepts a template with no day part yet", () => {
    const result = createSetupTemplateSchema.safeParse({ name: "Lunch rush", dayPartId: null });
    expect(result.success).toBe(true);
  });

  it("rejects a blank name", () => {
    const result = createSetupTemplateSchema.safeParse({ name: "", dayPartId: null });
    expect(result.success).toBe(false);
  });
});

describe("addTemplatePositionSchema", () => {
  it("requires both ids to be uuids", () => {
    const result = addTemplatePositionSchema.safeParse({
      templateId: "11111111-1111-4111-8111-111111111111",
      positionId: "22222222-2222-4222-8222-222222222222",
    });
    expect(result.success).toBe(true);
  });
});

describe("upsertTileSchema", () => {
  const base = {
    layoutId: "11111111-1111-4111-8111-111111111111",
    positionId: null,
    areaLabel: "Kitchen line",
    x: 0,
    y: 0,
    w: 2,
    h: 1,
  };

  it("accepts a valid tile", () => {
    expect(upsertTileSchema.safeParse(base).success).toBe(true);
  });

  it("rejects coordinates outside the 12x8 grid", () => {
    expect(upsertTileSchema.safeParse({ ...base, x: 20 }).success).toBe(false);
    expect(upsertTileSchema.safeParse({ ...base, y: 20 }).success).toBe(false);
  });

  it("rejects non-integer coordinates", () => {
    expect(upsertTileSchema.safeParse({ ...base, x: 1.5 }).success).toBe(false);
  });
});

describe("hasSeedPositionGroups", () => {
  it("is false when no groups exist at all", () => {
    expect(hasSeedPositionGroups([])).toBe(false);
  });

  it("is false when only unrelated groups exist (HIGH fix: training-roadmap 'FOH')", () => {
    expect(hasSeedPositionGroups(["FOH"])).toBe(false);
  });

  it("is true once any seed group name is present", () => {
    expect(hasSeedPositionGroups(["FOH", "Kitchen"])).toBe(true);
  });
});

describe("moveTileSchema", () => {
  it("accepts a valid move", () => {
    const result = moveTileSchema.safeParse({
      tileId: "11111111-1111-4111-8111-111111111111",
      x: 3,
      y: 4,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative coordinate", () => {
    const result = moveTileSchema.safeParse({
      tileId: "11111111-1111-4111-8111-111111111111",
      x: -1,
      y: 4,
    });
    expect(result.success).toBe(false);
  });
});
