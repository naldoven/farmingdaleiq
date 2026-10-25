import { describe, expect, it } from "vitest";

import { GRID_COLUMNS, GRID_ROWS } from "@/lib/setups/layout-grid";

import {
  SEED_DEFAULT_LAYOUT_TILES,
  SEED_DEFAULT_POSITION_GROUPS,
  addTemplatePositionSchema,
  buildDefaultLayoutTiles,
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

describe("SEED_DEFAULT_LAYOUT_TILES", () => {
  it("places every seeded setup position exactly once, inside the canvas, with no overlaps", () => {
    const seededPositions = SEED_DEFAULT_POSITION_GROUPS.flatMap((g) => g.positions);
    expect([...SEED_DEFAULT_LAYOUT_TILES.map((t) => t.position)].sort()).toEqual([...seededPositions].sort());

    const occupied = new Set<string>();
    for (const tile of SEED_DEFAULT_LAYOUT_TILES) {
      expect(tile.x + tile.w, tile.position).toBeLessThanOrEqual(GRID_COLUMNS);
      expect(tile.y + tile.h, tile.position).toBeLessThanOrEqual(GRID_ROWS);
      for (let dx = 0; dx < tile.w; dx += 1) {
        for (let dy = 0; dy < tile.h; dy += 1) {
          const cell = `${tile.x + dx},${tile.y + dy}`;
          expect(occupied.has(cell), `${tile.position} overlaps at ${cell}`).toBe(false);
          occupied.add(cell);
        }
      }
    }
  });
});

describe("buildDefaultLayoutTiles", () => {
  it("resolves seed tiles to position ids and skips positions the store no longer has", () => {
    const tiles = buildDefaultLayoutTiles(
      [
        { id: "p-reg1", name: "Register 1" },
        { id: "p-dishes", name: "Dishes" },
      ],
      [
        { position: "Register 1", x: 0, y: 0, w: 2, h: 1 },
        { position: "Sauces", x: 8, y: 5, w: 2, h: 1 },
        { position: "Dishes", x: 0, y: 7, w: 2, h: 1 },
      ],
    );
    expect(tiles).toEqual([
      { position_id: "p-reg1", x: 0, y: 0, w: 2, h: 1 },
      { position_id: "p-dishes", x: 0, y: 7, w: 2, h: 1 },
    ]);
  });

  it("prefers the first position when two share a name (setup position before a roadmap station)", () => {
    const tiles = buildDefaultLayoutTiles(
      [
        { id: "setup-reg1", name: "Register 1" },
        { id: "roadmap-reg1", name: "Register 1" },
      ],
      [{ position: "Register 1", x: 0, y: 0, w: 2, h: 1 }],
    );
    expect(tiles.map((t) => t.position_id)).toEqual(["setup-reg1"]);
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
