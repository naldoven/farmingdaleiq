import { z } from "zod";

/**
 * Input validation for the Rewards server actions
 * (app/(app)/rewards/actions.ts). Kept in a plain module (no "use server")
 * so it's unit-testable on its own and importable from both the action file
 * and its tests.
 */

export const createRewardSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  imageUrl: z.string().trim().max(2000).optional().or(z.literal("")),
  tokenCost: z.coerce.number().int("Enter a whole number").positive("Enter a positive cost"),
  // Blank/undefined means "unlimited stock" (stored as a null column) --
  // z.coerce.number() would otherwise coerce "" to 0, which is a very
  // different thing (out of stock), so the null case is normalized to null
  // in a preprocess step before the inner schema ever sees it.
  stock: z.preprocess((v) => {
    if (v === "" || v === undefined || v === null) return null;
    return typeof v === "number" ? v : Number(v);
  }, z.number().int().min(0).nullable()),
  active: z.boolean().default(true),
});

/** Pre-transform shape (what a plain HTML form / client component builds). */
export type CreateRewardInput = z.input<typeof createRewardSchema>;

export const updateRewardSchema = createRewardSchema.extend({
  id: z.string().uuid(),
});

export type UpdateRewardInput = z.input<typeof updateRewardSchema>;

export const claimRewardSchema = z.object({
  rewardId: z.string().uuid(),
  // TOK1: client-generated idempotency key (crypto.randomUUID) minted per claim
  // attempt so a retry/double-submit returns the first claim instead of debiting
  // the balance and creating a second claim. Optional for back-compat.
  requestId: z.string().uuid().optional(),
});

export type ClaimRewardInput = z.infer<typeof claimRewardSchema>;

export const claimIdSchema = z.object({
  claimId: z.string().uuid(),
});

export type ClaimIdInput = z.infer<typeof claimIdSchema>;
