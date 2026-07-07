/**
 * Token ledger contract. P0 defines the interface only — S7 (Tokens, rewards,
 * feed) implements it. Every function here is append-only over
 * `token_transactions`; a user's balance is ALWAYS the sum of their
 * transactions, never a stored column. Redemptions must validate the balance
 * inside a database transaction so concurrent claims cannot overspend
 * (PLAN.md S7 "Done" criterion).
 */

export type TokenTransactionKind =
  | "earn"
  | "recognition"
  | "top_performer"
  | "gift_in"
  | "gift_out"
  | "redeem"
  | "adjust";

export interface TokenTransactionRef {
  /** e.g. { task_id }, { checklist_run_id }, { reward_claim_id }, { from_user_id } */
  [key: string]: unknown;
}

export interface AwardTokensInput {
  userId: string;
  amount: number;
  kind: Extract<TokenTransactionKind, "earn" | "recognition" | "top_performer" | "adjust">;
  ref?: TokenTransactionRef;
  note?: string;
  createdBy: string;
}

export interface GiftTokensInput {
  fromUserId: string;
  toUserId: string;
  amount: number;
  note?: string;
}

export interface RedeemTokensInput {
  userId: string;
  rewardId: string;
  createdBy: string;
}

export interface TokenTransactionResult {
  transactionId: string;
  balanceAfter: number;
}

export interface TokenTransactionRow {
  delta: number;
}

/**
 * Pure sum-of-deltas helper: a user's balance is ALWAYS the sum of their
 * ledger rows, never a stored column. `getBalance` below is expected to load
 * a user's `token_transactions` rows and reduce them through this function.
 * Kept pure (no DB access) so it is unit-testable without Supabase.
 */
export function computeBalanceFromTransactions(
  transactions: TokenTransactionRow[]
): number {
  return transactions.reduce((sum, t) => sum + t.delta, 0);
}

/**
 * Computes a user's current balance as the sum of `token_transactions.delta`.
 * Implemented by S7; declared here so other modules can depend on the shape
 * without depending on the implementation.
 */
export declare function getBalance(userId: string): Promise<number>;

/** Credits tokens to a user (task/checklist completion, recognition, top performer, manual adjustment). */
export declare function awardTokens(input: AwardTokensInput): Promise<TokenTransactionResult>;

/** Moves tokens from one user's balance to another's, capped by the sender's current balance. */
export declare function giftTokens(input: GiftTokensInput): Promise<{
  debit: TokenTransactionResult;
  credit: TokenTransactionResult;
}>;

/**
 * Debits tokens for a reward claim inside a single DB transaction that
 * re-checks the balance immediately before the debit, and creates the
 * fulfillment task. Must be safe against a double-claim race.
 */
export declare function redeemReward(input: RedeemTokensInput): Promise<TokenTransactionResult>;
