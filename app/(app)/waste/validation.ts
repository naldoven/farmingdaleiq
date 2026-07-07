import { z } from "zod";

/**
 * Input validation for the Waste server actions (app/(app)/waste/actions.ts).
 * Kept in a plain module (no "use server") so it's unit-testable on its own
 * and importable from both the action file and client components
 * (components/waste/*) -- same pattern as app/(app)/people/validation.ts and
 * app/(app)/checklists/validation.ts.
 */

// Matches the `unit` check constraint on public.waste_items
// (supabase/migrations/20260707000900_waste.sql: "each" | "lb" | "oz").
export const WASTE_UNITS = ["each", "lb", "oz"] as const;
export type WasteUnit = (typeof WASTE_UNITS)[number];

export const idSchema = z.object({
  id: z.string().uuid(),
});
export type IdInput = z.infer<typeof idSchema>;

export const logEntrySchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  dayPartId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
export type LogEntryInput = z.infer<typeof logEntrySchema>;

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  sort: z.coerce.number().int().default(0),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.extend({
  id: z.string().uuid(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const createItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  categoryId: z.string().uuid().nullable().optional(),
  unit: z.enum(WASTE_UNITS),
  unitCost: z.coerce.number().nonnegative("Unit cost can't be negative").nullable().optional(),
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = createItemSchema.extend({
  id: z.string().uuid(),
});
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
