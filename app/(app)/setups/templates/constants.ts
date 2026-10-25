/**
 * Zod-free constants/helpers for the Setup Templates module. Kept out of
 * validation.ts so the client component
 * (components/setups/positions-manager.tsx) can import them without pulling zod
 * and the whole schema module into the browser bundle. validation.ts re-exports
 * these for server/action code.
 */

/** SEED-DEFAULT Avondale FOH/BOH position list -- used only when no positions exist yet. */
export const SEED_DEFAULT_POSITION_GROUPS: { name: string; positions: string[] }[] = [
  {
    name: "Front Counter",
    positions: ["Register 1", "Register 2", "Front Counter Support", "Beverage"],
  },
  {
    name: "Drive Thru",
    positions: ["DT Order Taker", "DT Cashier", "DT Runner", "DT Expo"],
  },
  {
    name: "Dining Room",
    positions: ["Dining Room", "Hospitality", "Curbside"],
  },
  {
    name: "Kitchen",
    positions: ["Breading", "Pressure", "Prep", "Boards", "Sauces"],
  },
  {
    name: "Back of House Support",
    positions: ["Dishes", "Stock", "Bagging"],
  },
];

/** Name of the layout seedDefaultLayout() creates. Matches the layout hand-built on the live store. */
export const SEED_DEFAULT_LAYOUT_NAME = "Main Floor (Default)";

/**
 * Fixed primary key for the seeded layout. store_layouts has no unique rule on
 * name or active, so two leaders tapping "Create default layout" at once could
 * both pass the "no layout yet" count and insert two ACTIVE defaults. Using a
 * constant id lets the primary key act as the arbiter: the second insert fails
 * with 23505 and seedDefaultLayout() treats that as "already seeded". No
 * migration needed. The id is only ever reused after the row was deleted.
 */
export const SEED_DEFAULT_LAYOUT_ID = "5eed0000-1a70-4000-8000-000000000001";

export interface SeedLayoutTile {
  /** Position name from SEED_DEFAULT_POSITION_GROUPS; the tile is skipped when no such position exists. */
  position: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * SEED-DEFAULT store layout on the 12x8 canvas (lib/setups/layout-grid.ts),
 * laid out the way a guest walks the building: front counter across the top
 * left, drive-thru top right, dining room beneath the counter, the kitchen
 * line below that, and back-of-house support along the bottom. Farmingdale's
 * real floor plan is still ARCHITECTURE.md open question 7; leaders can drag
 * or step every tile from the layout editor, so this only has to be a sane
 * starting point, not the final answer.
 */
export const SEED_DEFAULT_LAYOUT_TILES: readonly SeedLayoutTile[] = [
  // Front counter
  { position: "Register 1", x: 0, y: 0, w: 2, h: 1 },
  { position: "Register 2", x: 2, y: 0, w: 2, h: 1 },
  { position: "Front Counter Support", x: 4, y: 0, w: 2, h: 1 },
  { position: "Beverage", x: 0, y: 1, w: 2, h: 1 },
  // Drive thru
  { position: "DT Order Taker", x: 8, y: 0, w: 2, h: 1 },
  { position: "DT Cashier", x: 10, y: 0, w: 2, h: 1 },
  { position: "DT Runner", x: 8, y: 1, w: 2, h: 1 },
  { position: "DT Expo", x: 10, y: 1, w: 2, h: 1 },
  // Dining room
  { position: "Dining Room", x: 0, y: 3, w: 3, h: 1 },
  { position: "Hospitality", x: 3, y: 3, w: 3, h: 1 },
  { position: "Curbside", x: 8, y: 3, w: 2, h: 1 },
  // Kitchen line
  { position: "Breading", x: 0, y: 5, w: 2, h: 1 },
  { position: "Pressure", x: 2, y: 5, w: 2, h: 1 },
  { position: "Prep", x: 4, y: 5, w: 2, h: 1 },
  { position: "Boards", x: 6, y: 5, w: 2, h: 1 },
  { position: "Sauces", x: 8, y: 5, w: 2, h: 1 },
  // Back of house support
  { position: "Dishes", x: 0, y: 7, w: 2, h: 1 },
  { position: "Stock", x: 2, y: 7, w: 2, h: 1 },
  { position: "Bagging", x: 4, y: 7, w: 2, h: 1 },
];

export interface SeededLayoutTileInsert {
  position_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Resolves the seed tiles against the positions that actually exist. A seed
 * position the store renamed or deleted is skipped rather than failing the
 * whole seed, and when two positions share a name (the live store has a
 * training-roadmap "Register 1" beside the setup "Register 1") the first one
 * in the caller's order wins, so callers pass setup positions sorted by group.
 * Pure so it is unit-testable without a database.
 */
export function buildDefaultLayoutTiles(
  positions: readonly { id: string; name: string }[],
  seed: readonly SeedLayoutTile[] = SEED_DEFAULT_LAYOUT_TILES,
): SeededLayoutTileInsert[] {
  const idByName = new Map<string, string>();
  for (const position of positions) {
    if (!idByName.has(position.name)) idByName.set(position.name, position.id);
  }
  const tiles: SeededLayoutTileInsert[] = [];
  for (const tile of seed) {
    const positionId = idByName.get(tile.position);
    if (!positionId) continue;
    tiles.push({ position_id: positionId, x: tile.x, y: tile.y, w: tile.w, h: tile.h });
  }
  return tiles;
}

/**
 * True once any of the seed's own group names already exist. Pure so it's
 * unit-testable without a database (HIGH parity-audit fix: the old gate checked
 * "position_groups is empty", which never re-fires once an unrelated group --
 * e.g. S4's training-roadmap "FOH" group -- exists; the real question is whether
 * THIS seed's groups are there).
 */
export function hasSeedPositionGroups(existingGroupNames: string[]): boolean {
  const seedNames = new Set(SEED_DEFAULT_POSITION_GROUPS.map((g) => g.name));
  return existingGroupNames.some((name) => seedNames.has(name));
}
