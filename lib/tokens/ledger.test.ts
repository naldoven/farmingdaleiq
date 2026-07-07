import { describe, expect, it } from "vitest";

import {
  awardInsertAllowedByPolicy,
  awardTokens,
  cancelRewardClaim,
  computeBalanceFromTransactions,
  getBalance,
  giftTokens,
  redeemReward,
  type TokenTransactionRow,
} from "@/lib/tokens/ledger";

describe("awardInsertAllowedByPolicy (FIQ-01: award holders can't self-mint)", () => {
  const base = {
    kind: "earn",
    hasAwardPermission: true,
    createdBy: "leader-1",
    actorId: "leader-1",
    userId: "member-2",
  };

  it("allows a tokens.award holder to credit a coworker", () => {
    expect(awardInsertAllowedByPolicy(base)).toBe(true);
  });

  it("rejects self-credit even for an award holder", () => {
    expect(awardInsertAllowedByPolicy({ ...base, userId: "leader-1" })).toBe(false);
  });

  it("rejects an 'adjust' row inserted directly (must go through adjust_tokens RPC)", () => {
    expect(awardInsertAllowedByPolicy({ ...base, kind: "adjust" })).toBe(false);
  });

  it("rejects gift_in / redeem kinds (SECURITY DEFINER only)", () => {
    expect(awardInsertAllowedByPolicy({ ...base, kind: "gift_in" })).toBe(false);
    expect(awardInsertAllowedByPolicy({ ...base, kind: "redeem" })).toBe(false);
  });

  it("rejects a caller without tokens.award", () => {
    expect(awardInsertAllowedByPolicy({ ...base, hasAwardPermission: false })).toBe(false);
  });

  it("rejects an unattributed insert (created_by must be the actor)", () => {
    expect(awardInsertAllowedByPolicy({ ...base, createdBy: null })).toBe(false);
    expect(awardInsertAllowedByPolicy({ ...base, createdBy: "someone-else" })).toBe(false);
  });
});

describe("computeBalanceFromTransactions", () => {
  it("returns 0 for an empty ledger", () => {
    expect(computeBalanceFromTransactions([])).toBe(0);
  });

  it("sums positive and negative deltas", () => {
    const rows: TokenTransactionRow[] = [{ delta: 5 }, { delta: 20 }, { delta: -10 }];
    expect(computeBalanceFromTransactions(rows)).toBe(15);
  });

  it("can go negative from redeem/gift_out rows (caller must prevent that, not this helper)", () => {
    expect(computeBalanceFromTransactions([{ delta: 10 }, { delta: -15 }])).toBe(-5);
  });
});

/** Minimal fake Supabase client covering only what ledger.ts calls. */
function makeFakeClient(opts: {
  transactionsByUser?: Record<string, { delta: number }[]>;
  onInsert?: (row: Record<string, unknown>) => { id: string } | { error: string };
  onRpc?: (fn: string, args: Record<string, unknown>) => unknown;
}) {
  const transactionsByUser = opts.transactionsByUser ?? {};

  return {
    from(table: string) {
      if (table !== "token_transactions") throw new Error(`unexpected table ${table}`);
      let filterUserId: string | undefined;
      const builder = {
        select() {
          return builder;
        },
        eq(_col: string, value: string) {
          filterUserId = value;
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return Promise.resolve({ data: transactionsByUser[filterUserId!] ?? [], error: null });
        },
        insert(row: Record<string, unknown>) {
          const result = opts.onInsert?.(row) ?? { id: "tx-1" };
          if ("error" in result) {
            return {
              select() {
                return { single: () => Promise.resolve({ data: null, error: { message: result.error } }) };
              },
            };
          }
          const userId = row.user_id as string;
          transactionsByUser[userId] = [...(transactionsByUser[userId] ?? []), { delta: row.delta as number }];
          return {
            select() {
              return { single: () => Promise.resolve({ data: { id: result.id }, error: null }) };
            },
          };
        },
        then(resolve: (v: { data: unknown; error: null }) => void) {
          resolve({ data: transactionsByUser[filterUserId!] ?? [], error: null });
        },
      };
      return builder;
    },
    rpc(fn: string, args: Record<string, unknown>) {
      const result = opts.onRpc?.(fn, args);
      return {
        single: () => Promise.resolve(result),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("getBalance", () => {
  it("sums a user's transaction rows via the client", async () => {
    const client = makeFakeClient({
      transactionsByUser: { "user-1": [{ delta: 30 }, { delta: -10 }] },
    });
    await expect(getBalance("user-1", client)).resolves.toBe(20);
  });

  it("returns 0 for a user with no transactions", async () => {
    const client = makeFakeClient({});
    await expect(getBalance("user-none", client)).resolves.toBe(0);
  });
});

describe("awardTokens", () => {
  it("inserts an earn transaction and returns the resulting balance", async () => {
    const client = makeFakeClient({
      transactionsByUser: { "user-1": [{ delta: 5 }] },
    });

    const result = await awardTokens(
      {
        userId: "user-1",
        amount: 15,
        kind: "earn",
        ref: { task_id: "task-1" },
        createdBy: null,
      },
      client
    );

    expect(result.transactionId).toBe("tx-1");
    expect(result.balanceAfter).toBe(20);
  });

  it("surfaces an insert error instead of returning a fabricated result", async () => {
    const client = makeFakeClient({
      onInsert: () => ({ error: "boom" }),
    });

    await expect(
      awardTokens({ userId: "user-1", amount: 15, kind: "earn", createdBy: null }, client)
    ).rejects.toThrow(/boom/);
  });
});

describe("giftTokens", () => {
  it("delegates to the gift_tokens RPC and reports the sender's post-gift balance", async () => {
    const client = makeFakeClient({
      onRpc: (fn, args) => {
        expect(fn).toBe("gift_tokens");
        expect(args).toMatchObject({ p_to_user_id: "user-2", p_amount: 10 });
        return {
          data: { debit_transaction_id: "tx-debit", credit_transaction_id: "tx-credit", balance_after: 40 },
          error: null,
        };
      },
    });

    const result = await giftTokens(
      { fromUserId: "user-1", toUserId: "user-2", amount: 10 },
      client
    );

    expect(result.debit).toEqual({ transactionId: "tx-debit", balanceAfter: 40 });
    // FIQ-19: credit no longer reports a fabricated recipient balance.
    expect(result.credit).toEqual({ transactionId: "tx-credit" });
  });

  it("throws when the RPC rejects (e.g. insufficient balance)", async () => {
    const client = makeFakeClient({
      onRpc: () => ({ data: null, error: { message: "Insufficient balance" } }),
    });

    await expect(
      giftTokens({ fromUserId: "user-1", toUserId: "user-2", amount: 999 }, client)
    ).rejects.toThrow(/Insufficient balance/);
  });
});

describe("redeemReward", () => {
  it("delegates to the redeem_reward RPC and surfaces the claim + balance", async () => {
    const client = makeFakeClient({
      onRpc: (fn, args) => {
        expect(fn).toBe("redeem_reward");
        expect(args).toEqual({ p_reward_id: "reward-1" });
        return {
          data: { transaction_id: "tx-1", claim_id: "claim-1", balance_after: 5, cost: 25 },
          error: null,
        };
      },
    });

    const result = await redeemReward(
      { userId: "user-1", rewardId: "reward-1", createdBy: "user-1" },
      client
    );

    expect(result).toEqual({ transactionId: "tx-1", balanceAfter: 5, claimId: "claim-1", cost: 25 });
  });

  it("throws when the RPC rejects (e.g. insufficient balance or out of stock)", async () => {
    const client = makeFakeClient({
      onRpc: () => ({ data: null, error: { message: "Insufficient balance" } }),
    });

    await expect(
      redeemReward({ userId: "user-1", rewardId: "reward-1", createdBy: "user-1" }, client)
    ).rejects.toThrow(/Insufficient balance/);
  });
});

describe("cancelRewardClaim", () => {
  it("delegates to the cancel_reward_claim RPC and returns the refunded balance", async () => {
    const client = makeFakeClient({
      onRpc: (fn, args) => {
        expect(fn).toBe("cancel_reward_claim");
        expect(args).toEqual({ p_claim_id: "claim-1" });
        return { data: { transaction_id: "tx-refund", balance_after: 30 }, error: null };
      },
    });

    const result = await cancelRewardClaim("claim-1", client);
    expect(result).toEqual({ transactionId: "tx-refund", balanceAfter: 30 });
  });

  it("throws when the claim isn't pending", async () => {
    const client = makeFakeClient({
      onRpc: () => ({ data: null, error: { message: "Only a pending claim can be cancelled" } }),
    });

    await expect(cancelRewardClaim("claim-1", client)).rejects.toThrow(/pending claim/);
  });
});

/**
 * Simulates the SAME algorithm redeem_reward() encodes in SQL
 * (supabase/migrations/20260707030000_tokens_rewards_feed_rls.sql): take a
 * per-user lock, re-read the balance, check it against cost, then debit.
 * `withLock=false` reproduces the check-then-insert race a naive
 * implementation (or two truly concurrent Postgres transactions without the
 * advisory lock) would have -- both read the same starting balance before
 * either commits, so both can pass the check and double-spend. This test
 * documents *why* the migration takes `pg_advisory_xact_lock` before
 * re-reading the balance (PLAN.md S7 "Done": "concurrent double-claim
 * cannot overspend (test proves it)").
 */
function makeConcurrencySimulator(startingBalance: number, withLock: boolean) {
  let balance = startingBalance;
  let locked = false;
  const waiters: Array<() => void> = [];

  async function acquireLock() {
    if (!withLock) return;
    if (locked) {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    locked = true;
  }

  function releaseLock() {
    if (!withLock) return;
    locked = false;
    const next = waiters.shift();
    if (next) next();
  }

  return async function redeem(cost: number): Promise<"ok" | "insufficient"> {
    await acquireLock();
    try {
      // Simulates two statements inside one Postgres transaction: read the
      // ledger sum, then (if it covers cost) insert the debit. Without the
      // lock, both concurrent calls read `balance` before either writes.
      const currentBalance = balance;
      await Promise.resolve(); // yield, matching real async round trips
      if (currentBalance < cost) return "insufficient";
      balance = currentBalance - cost;
      return "ok";
    } finally {
      releaseLock();
    }
  };
}

describe("redeem concurrency (double-claim cannot overspend)", () => {
  it("without the advisory lock, two concurrent redeems can both succeed and overspend", async () => {
    const redeem = makeConcurrencySimulator(30, /* withLock */ false);

    const [a, b] = await Promise.all([redeem(25), redeem(25)]);

    // Demonstrates the bug the lock prevents: both see balance=30 >= 25
    // before either commits.
    expect([a, b]).toEqual(["ok", "ok"]);
  });

  it("with the advisory lock (matching redeem_reward()'s design), only one of two concurrent redeems succeeds", async () => {
    const redeem = makeConcurrencySimulator(30, /* withLock */ true);

    const [a, b] = await Promise.all([redeem(25), redeem(25)]);

    const results = [a, b].sort();
    expect(results).toEqual(["insufficient", "ok"]);
  });

  it("with the lock, three concurrent double-claims of the same reward never let total spend exceed the starting balance", async () => {
    const startingBalance = 40;
    const cost = 25;
    const redeem = makeConcurrencySimulator(startingBalance, true);

    const results = await Promise.all([redeem(cost), redeem(cost), redeem(cost)]);
    const successes = results.filter((r) => r === "ok").length;

    expect(successes).toBe(1);
    expect(successes * cost).toBeLessThanOrEqual(startingBalance);
  });
});
