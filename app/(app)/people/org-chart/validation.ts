import { z } from "zod";

export const createTierSchema = z.object({
  department: z.enum(["foh", "kitchen", "store"]),
  name: z.string().trim().min(1, "Name is required"),
  goalCount: z.number().int().min(0).default(0),
  sort: z.number().int().min(0).default(0),
});
export type CreateTierInput = z.infer<typeof createTierSchema>;

export const deleteTierSchema = z.object({ id: z.string().uuid() });
export type DeleteTierInput = z.infer<typeof deleteTierSchema>;

export const createSlotSchema = z.object({
  tierId: z.string().uuid(),
  label: z.string().trim().max(200).optional().or(z.literal("")),
  sort: z.number().int().min(0).default(0),
});
export type CreateSlotInput = z.infer<typeof createSlotSchema>;

export const assignSlotSchema = z.object({
  slotId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
});
export type AssignSlotInput = z.infer<typeof assignSlotSchema>;

export const deleteSlotSchema = z.object({ id: z.string().uuid() });
export type DeleteSlotInput = z.infer<typeof deleteSlotSchema>;
