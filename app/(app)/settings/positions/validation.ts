import { z } from "zod";

/**
 * Input validation for the /settings/positions server actions
 * (app/(app)/settings/positions/actions.ts). Plain module, no "use server",
 * so it is unit-testable on its own. The group and position name schemas
 * are shared with the dormant Setups editor
 * (app/(app)/setups/templates/validation.ts) so the two never drift.
 */

export {
  createPositionGroupSchema,
  createPositionSchema,
  deletePositionGroupSchema,
  deletePositionSchema,
  renamePositionGroupSchema,
  updatePositionSchema,
} from "@/app/(app)/setups/templates/validation";

export const setPositionRateableSchema = z.object({
  id: z.string().uuid(),
  isRateable: z.boolean(),
});
export type SetPositionRateableInput = z.infer<typeof setPositionRateableSchema>;

/**
 * The full ordered id list for one group (or the ungrouped bucket), not a
 * pairwise swap: writing sort = index for every row normalizes stale or tied
 * sort values in the same pass, the way waste reorderItems does.
 */
export const reorderPositionsSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1).max(200),
});
export type ReorderPositionsInput = z.infer<typeof reorderPositionsSchema>;
