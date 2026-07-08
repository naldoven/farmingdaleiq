/**
 * Zod-free constants for the Waste module. Kept out of validation.ts so client
 * components (components/waste/item-manager.tsx) can import them without pulling
 * zod and the whole schema module into the browser bundle. validation.ts
 * re-exports these for server/action code.
 */

// Matches the `unit` check constraint on public.waste_items
// (supabase/migrations/20260707000900_waste.sql: "each" | "lb" | "oz").
export const WASTE_UNITS = ["each", "lb", "oz"] as const;
export type WasteUnit = (typeof WASTE_UNITS)[number];
