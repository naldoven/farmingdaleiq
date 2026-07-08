import { z } from "zod";

import { WASTE_UNITS, type WasteUnit } from "./constants";

/**
 * Input validation for the Waste server actions (app/(app)/waste/actions.ts).
 * Kept in a plain module (no "use server") so it's unit-testable on its own.
 * The unit constants live in ./constants (zod-free) so client components
 * (components/waste/*) can import them without pulling zod into the browser;
 * they are re-exported here for server/action code.
 */

export { WASTE_UNITS };
export type { WasteUnit };

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
