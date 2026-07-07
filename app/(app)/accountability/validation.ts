import { z } from "zod";

import { PERIOD_KINDS } from "./logic";

/**
 * Input validation for the Accountability server actions
 * (app/(app)/accountability/actions.ts). Kept in a plain module (no "use
 * server") so it's unit-testable on its own and importable from both the
 * action file and its tests -- same pattern as
 * app/(app)/people/validation.ts.
 */

export const issueInfractionSchema = z.object({
  userId: z.string().uuid(),
  typeId: z.string().uuid(),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
export type IssueInfractionInput = z.infer<typeof issueInfractionSchema>;

export const acknowledgeDisciplinaryActionSchema = z.object({
  id: z.string().uuid(),
});
export type AcknowledgeDisciplinaryActionInput = z.infer<
  typeof acknowledgeDisciplinaryActionSchema
>;

export const upsertInfractionTypeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name is required"),
  points: z.coerce.number().int().min(0).max(1000),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  active: z.boolean(),
});
export type UpsertInfractionTypeInput = z.infer<typeof upsertInfractionTypeSchema>;

export const upsertDisciplinaryActionTypeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Name is required"),
  thresholdPoints: z.coerce.number().int().min(1).max(10000),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  sort: z.coerce.number().int().min(0).max(1000).default(0),
});
export type UpsertDisciplinaryActionTypeInput = z.infer<
  typeof upsertDisciplinaryActionTypeSchema
>;

export const deleteByIdSchema = z.object({
  id: z.string().uuid(),
});
export type DeleteByIdInput = z.infer<typeof deleteByIdSchema>;

export const updateAccountabilitySettingsSchema = z.object({
  id: z.string().uuid(),
  periodKind: z.enum(PERIOD_KINDS),
  periodDays: z.coerce.number().int().min(1).max(3650),
});
export type UpdateAccountabilitySettingsInput = z.infer<
  typeof updateAccountabilitySettingsSchema
>;
