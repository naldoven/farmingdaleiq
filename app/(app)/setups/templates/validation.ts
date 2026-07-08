import { z } from "zod";

/**
 * Input validation for /setups/templates server actions
 * (app/(app)/setups/templates/actions.ts). Plain module (no "use server") so
 * it's unit-testable on its own, matching the People/Teams reference
 * pattern (app/(app)/people/validation.ts).
 */

// Position groups & positions ------------------------------------------------

export const createPositionGroupSchema = z.object({
  name: z.string().trim().min(1, "Group name is required"),
});
export type CreatePositionGroupInput = z.infer<typeof createPositionGroupSchema>;

export const renamePositionGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Group name is required"),
});
export type RenamePositionGroupInput = z.infer<typeof renamePositionGroupSchema>;

export const deletePositionGroupSchema = z.object({ id: z.string().uuid() });
export type DeletePositionGroupInput = z.infer<typeof deletePositionGroupSchema>;

export const createPositionSchema = z.object({
  groupId: z.string().uuid().nullable(),
  name: z.string().trim().min(1, "Position name is required"),
});
export type CreatePositionInput = z.infer<typeof createPositionSchema>;

export const updatePositionSchema = z.object({
  id: z.string().uuid(),
  groupId: z.string().uuid().nullable(),
  name: z.string().trim().min(1, "Position name is required"),
});
export type UpdatePositionInput = z.infer<typeof updatePositionSchema>;

export const deletePositionSchema = z.object({ id: z.string().uuid() });
export type DeletePositionInput = z.infer<typeof deletePositionSchema>;

// Setup templates -------------------------------------------------------------

export const createSetupTemplateSchema = z.object({
  name: z.string().trim().min(1, "Template name is required"),
  dayPartId: z.string().uuid().nullable(),
});
export type CreateSetupTemplateInput = z.infer<typeof createSetupTemplateSchema>;

export const deleteSetupTemplateSchema = z.object({ id: z.string().uuid() });
export type DeleteSetupTemplateInput = z.infer<typeof deleteSetupTemplateSchema>;

export const addTemplatePositionSchema = z.object({
  templateId: z.string().uuid(),
  positionId: z.string().uuid(),
});
export type AddTemplatePositionInput = z.infer<typeof addTemplatePositionSchema>;

export const removeTemplatePositionSchema = z.object({
  templateId: z.string().uuid(),
  positionId: z.string().uuid(),
});
export type RemoveTemplatePositionInput = z.infer<typeof removeTemplatePositionSchema>;

export const reorderTemplatePositionSchema = z.object({
  templateId: z.string().uuid(),
  positionId: z.string().uuid(),
  direction: z.enum(["up", "down"]),
});
export type ReorderTemplatePositionInput = z.infer<typeof reorderTemplatePositionSchema>;

// Store layouts & tiles --------------------------------------------------------

export const createLayoutSchema = z.object({
  name: z.string().trim().min(1, "Layout name is required"),
  dayPartId: z.string().uuid().nullable(),
});
export type CreateLayoutInput = z.infer<typeof createLayoutSchema>;

export const setLayoutActiveSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});
export type SetLayoutActiveInput = z.infer<typeof setLayoutActiveSchema>;

export const deleteLayoutSchema = z.object({ id: z.string().uuid() });
export type DeleteLayoutInput = z.infer<typeof deleteLayoutSchema>;

export const upsertTileSchema = z.object({
  layoutId: z.string().uuid(),
  positionId: z.string().uuid().nullable(),
  areaLabel: z.string().trim().max(60).optional().or(z.literal("")),
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0).max(7),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(8),
});
export type UpsertTileInput = z.infer<typeof upsertTileSchema>;

export const moveTileSchema = z.object({
  tileId: z.string().uuid(),
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0).max(7),
});
export type MoveTileInput = z.infer<typeof moveTileSchema>;

export const deleteTileSchema = z.object({ id: z.string().uuid() });
export type DeleteTileInput = z.infer<typeof deleteTileSchema>;

// The seed position list + its detection helper are zod-free and moved to
// ./constants so the client positions-manager can import them without pulling
// zod into the browser; re-exported here for server/action code and tests.
export {
  hasSeedPositionGroups,
  SEED_DEFAULT_POSITION_GROUPS,
} from "./constants";
