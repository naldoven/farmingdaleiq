/**
 * Token ledger implementation (PLAN.md S7: "ledger implementation
 * (append-only, balance computed, redemption validates inside a
 * transaction)"). P0 declared this file's interface only
 * (docs/agent-map.md: "lib/tokens/ledger.ts (interface only until S7)");
 * this stream fills it in. Every function here is append-only over
 * `token_transactions`; a user's balance is ALWAYS the sum of their
 * transactions, never a stored column. `redeemReward` and `giftTokens` call
 * SECURITY DEFINER Postgres functions (supabase/migrations/20260707030000_
 * tokens_rewards_feed_rls.sql: redeem_reward / gift_tokens) that re-check
 * the balance inside a single transaction (with a per-user advisory lock)
 * immediately before debiting, so concurrent calls for the same user cannot
 * overspend.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

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
  createdBy: string | null;
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

type Client = SupabaseClient<Database>;

/**
 * Pure sum-of-deltas helper: a user's balance is ALWAYS the sum of their
 * ledger rows, never a stored column. `getBalance` below loads a user's
 * `token_transactions` rows and reduces them through this function. Kept
 * pure (no DB access) so it is unit-testable without Supabase.
 */
export function computeBalanceFromTransactions(
  transactions: TokenTransactionRow[]
): number {
  return transactions.reduce((sum, t) => sum + t.delta, 0);
}

/**
 * Computes a user's current balance as the sum of `token_transactions.delta`.
 * Accepts an optional client so callers with no user session (the
 * service-role event consumer) can pass their own.
 */
export async function getBalance(userId: string, client?: Client): Promise<number> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("token_transactions")
    .select("delta")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`getBalance(${userId}) failed: ${error.message}`);
  }

  return computeBalanceFromTransactions(data ?? []);
}

/**
 * Returns a user's recent transactions, most recent first. Not part of the
 * original P0 interface, but a small additive helper the /tokens history
 * view and its tests depend on.
 */
export async function getRecentTransactions(
  userId: string,
  limit: number,
  client?: Client
) {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase
    .from("token_transactions")
    .select("id, delta, kind, ref, note, created_at, created_by")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getRecentTransactions(${userId}) failed: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Credits tokens to a user: task/checklist completion (earn), a leader
 * recognition, a shift Top Performer award, or a manual admin adjustment.
 * Callers must already have checked the relevant permission
 * (requirePermission("tokens.award")) -- this is also re-checked at the
 * database layer by the RLS insert policy on token_transactions
 * (token_transactions_insert_award), except when `client` is the
 * service-role client (the event consumer), which bypasses RLS entirely.
 */
export async function awardTokens(
  input: AwardTokensInput,
  client?: Client
): Promise<TokenTransactionResult> {
  const supabase = client ?? (await createClient());

  const { data, error } = await supabase
    .from("token_transactions")
    .insert({
      user_id: input.userId,
      delta: input.amount,
      kind: input.kind,
      ref: (input.ref ?? null) as Json | null,
      note: input.note ?? null,
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`awardTokens(${input.userId}) failed: ${error?.message ?? "no row returned"}`);
  }

  const balanceAfter = await getBalance(input.userId, supabase);
  return { transactionId: data.id, balanceAfter };
}

/**
 * Moves tokens from one user's balance to another's, capped by the sender's
 * current balance. Delegates to the gift_tokens() SQL function (SECURITY
 * DEFINER, per-user advisory lock) so a double-submit can't overspend.
 */
export async function giftTokens(
  input: GiftTokensInput,
  client?: Client
): Promise<{
  debit: TokenTransactionResult;
  credit: TokenTransactionResult;
}> {
  const supabase = client ?? (await createClient());

  const { data, error } = await supabase
    .rpc("gift_tokens", {
      p_to_user_id: input.toUserId,
      p_amount: input.amount,
      p_note: input.note ?? null,
    })
    .single();

  if (error || !data) {
    throw new Error(`giftTokens(${input.fromUserId} -> ${input.toUserId}) failed: ${error?.message ?? "no row returned"}`);
  }

  return {
    debit: { transactionId: data.debit_transaction_id, balanceAfter: data.balance_after },
    credit: { transactionId: data.credit_transaction_id, balanceAfter: data.balance_after + input.amount },
  };
}

export interface RedeemRewardResult extends TokenTransactionResult {
  claimId: string;
  cost: number;
}

/**
 * Debits tokens for a reward claim by calling the redeem_reward() SQL
 * function (SECURITY DEFINER, per-user advisory lock + `for update` on the
 * reward row), which re-checks the balance and reward stock inside a single
 * transaction immediately before the debit -- safe against a double-claim
 * race (PLAN.md S7 "Done": "concurrent double-claim cannot overspend").
 * Fulfillment-task creation is out of scope here (tasks is owned by S2);
 * the caller (app/(app)/rewards/actions.ts) emits a `reward_claim` event
 * for the P2 wiring / S2 consumer to create the task.
 */
export async function redeemReward(
  input: RedeemTokensInput,
  client?: Client
): Promise<RedeemRewardResult> {
  const supabase = client ?? (await createClient());

  const { data, error } = await supabase
    .rpc("redeem_reward", { p_reward_id: input.rewardId })
    .single();

  if (error || !data) {
    throw new Error(`redeemReward(${input.userId}, ${input.rewardId}) failed: ${error?.message ?? "no row returned"}`);
  }

  return {
    transactionId: data.transaction_id,
    balanceAfter: data.balance_after,
    claimId: data.claim_id,
    cost: data.cost,
  };
}

/**
 * Cancels a pending reward claim and refunds the ledger (an `adjust`
 * credit), atomically, via the cancel_reward_claim() SQL function. Not part
 * of the original P0 interface, but the money-safe counterpart to
 * redeemReward that app/(app)/rewards/actions.ts (rewards.fulfill /
 * rewards.manage) needs.
 */
export async function cancelRewardClaim(
  claimId: string,
  client?: Client
): Promise<TokenTransactionResult> {
  const supabase = client ?? (await createClient());

  const { data, error } = await supabase
    .rpc("cancel_reward_claim", { p_claim_id: claimId })
    .single();

  if (error || !data) {
    throw new Error(`cancelRewardClaim(${claimId}) failed: ${error?.message ?? "no row returned"}`);
  }

  return { transactionId: data.transaction_id, balanceAfter: data.balance_after };
}
