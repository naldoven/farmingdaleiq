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
  // TOK1: client-generated idempotency key (crypto.randomUUID) minted per
  // submit attempt so a retry/double-submit dedupes at the ledger. Optional so
  // a caller that omits it keeps the pre-idempotency behavior.
  requestId: z.string().uuid().optional(),
});

export type GiftTokensInput = z.infer<typeof giftTokensSchema>;

export const adjustTokensSchema = z.object({
  userId: z.string().uuid(),
  // Signed correction: positive credits, negative debits, never zero. The
  // adjust_tokens() SQL function enforces the same non-zero + range bounds.
  delta: z.coerce
    .number()
    .int("Enter a whole number")
    .refine((n) => n !== 0, "Adjustment can't be zero")
    .refine((n) => Math.abs(n) <= 1_000_000, "Adjustment is out of range"),
  note: z.string().trim().max(280).optional().or(z.literal("")),
});

export type AdjustTokensInput = z.infer<typeof adjustTokensSchema>;

export const updateEarningRuleSchema = z.object({
  eventKey: z.string().trim().min(1),
  amount: z.coerce.number().int("Enter a whole number").min(0, "Amount can't be negative").max(100000),
});

export type UpdateEarningRuleInput = z.infer<typeof updateEarningRuleSchema>;
