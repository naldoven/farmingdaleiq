import { z } from "zod";

/**
 * Input validation for the Tokens server actions
 * (app/(app)/tokens/actions.ts). Kept in a plain module (no "use server") so
 * it's unit-testable on its own and importable from both the action file
 * and its tests.
 */

export const giftTokensSchema = z.object({
  toUserId: z.string().uuid(),
  amount: z.coerce.number().int("Enter a whole number").positive("Enter a positive amount").max(100000),
  note: z.string().trim().max(280).optional().or(z.literal("")),
});

export type GiftTokensInput = z.infer<typeof giftTokensSchema>;

export const updateEarningRuleSchema = z.object({
  eventKey: z.string().trim().min(1),
  amount: z.coerce.number().int("Enter a whole number").min(0, "Amount can't be negative").max(100000),
});

export type UpdateEarningRuleInput = z.infer<typeof updateEarningRuleSchema>;
