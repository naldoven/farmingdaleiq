import { z } from "zod";

/**
 * Input validation for the /setups server actions (app/(app)/setups/actions.ts).
 * Plain module (no "use server") so it's unit-testable on its own.
 */

export const createSetupSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  dayPartId: z.string().uuid().nullable(),
  templateId: z.string().uuid().nullable(),
  shiftLeaderId: z.string().uuid().nullable(),
});
export type CreateSetupInput = z.infer<typeof createSetupSchema>;

export const assignPositionSchema = z.object({
  setupId: z.string().uuid(),
  positionId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  arrivalTime: z.string().trim().optional().or(z.literal("")),
});
export type AssignPositionInput = z.infer<typeof assignPositionSchema>;

export const removeAssignmentSchema = z.object({ id: z.string().uuid() });
export type RemoveAssignmentInput = z.infer<typeof removeAssignmentSchema>;

export const postSetupSchema = z.object({ id: z.string().uuid() });
export type PostSetupInput = z.infer<typeof postSetupSchema>;

export const addShiftNoteSchema = z.object({
  setupId: z.string().uuid(),
  body: z.string().trim().min(1, "Note can't be empty"),
});
export type AddShiftNoteInput = z.infer<typeof addShiftNoteSchema>;

export const selectTopPerformerSchema = z.object({
  setupId: z.string().uuid(),
  userId: z.string().uuid(),
});
export type SelectTopPerformerInput = z.infer<typeof selectTopPerformerSchema>;

export const suggestAssigneesSchema = z.object({
  positionId: z.string().uuid(),
  candidateUserIds: z.array(z.string().uuid()),
});
export type SuggestAssigneesInput = z.infer<typeof suggestAssigneesSchema>;
