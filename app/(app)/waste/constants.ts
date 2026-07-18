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

// Upper bound on a single waste-log quantity. A real one-shot waste entry is a
// pan, a tray, a case: a few units to low hundreds. 10,000 leaves generous room
// for the largest legitimate case count or an oz/lb weight while rejecting the
// typo class the audit found (1e21 rendered as "$5.84e+21" in the cost
// rollups). Enforced in three layers: the logEntrySchema zod max
// (app/(app)/waste/validation.ts), the max attribute on the quantity input
// (components/waste/log-entry-form.tsx), and the waste_entries_quantity_upper_bound
// DB CHECK (supabase/migrations/20260718000200_waste_quantity_upper_bound.sql).
// Kept here (zod-free) so the client input can import it without pulling zod
// into the browser bundle.
export const WASTE_QUANTITY_MAX = 10_000;
