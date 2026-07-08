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
