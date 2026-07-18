import { describe, expect, it } from "vitest";

import {
  adjustTokens,
  awardInsertAllowedByPolicy,
  awardTokens,
  cancelRewardClaim,
  computeBalanceFromTransactions,
  DuplicateTokenAwardError,
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
  onInsert?: (row: Record<string, unknown>) => { id: string } | { error: string; code?: string };
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
                return {
                  single: () =>
                    Promise.resolve({ data: null, error: { message: result.error, code: result.code } }),
                };
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

  it("throws a DuplicateTokenAwardError on a unique-violation (23505) so the caller can absorb a double-submit", async () => {
    const client = makeFakeClient({
      onInsert: () => ({ error: "duplicate key value violates unique constraint", code: "23505" }),
    });

    await expect(
      awardTokens(
        {
          userId: "user-1",
          amount: 15,
          kind: "recognition",
          ref: { event_id: "dupe-key" },
          createdBy: "leader-1",
        },
        client
      )
    ).rejects.toBeInstanceOf(DuplicateTokenAwardError);
  });
});

describe("adjustTokens", () => {
  it("delegates to the adjust_tokens RPC and returns the resulting balance", async () => {
    const client = makeFakeClient({
      onRpc: (fn, args) => {
        expect(fn).toBe("adjust_tokens");
        expect(args).toEqual({ p_user_id: "user-1", p_delta: -10, p_note: "clawback" });
        return { data: { transaction_id: "tx-adjust", balance_after: 5 }, error: null };
      },
    });

    const result = await adjustTokens({ userId: "user-1", delta: -10, note: "clawback" }, client);
    expect(result).toEqual({ transactionId: "tx-adjust", balanceAfter: 5 });
  });

  it("passes a null note through when none is given", async () => {
    const client = makeFakeClient({
      onRpc: (_fn, args) => {
        expect(args).toEqual({ p_user_id: "user-1", p_delta: 20, p_note: null });
        return { data: { transaction_id: "tx-adjust", balance_after: 40 }, error: null };
      },
    });

    await adjustTokens({ userId: "user-1", delta: 20 }, client);
  });

  it("throws when the RPC rejects (e.g. missing tokens.manage)", async () => {
    const client = makeFakeClient({
      onRpc: () => ({ data: null, error: { message: "Missing permission: tokens.manage" } }),
    });

    await expect(adjustTokens({ userId: "user-1", delta: 5 }, client)).rejects.toThrow(/tokens\.manage/);
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

  it("threads p_request_id through to the RPC (null when omitted, the id when given)", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const client = makeFakeClient({
      onRpc: (_fn, args) => {
        seen.push(args);
        return {
          data: { debit_transaction_id: "tx-debit", credit_transaction_id: "tx-credit", balance_after: 40 },
          error: null,
        };
      },
    });

    await giftTokens({ fromUserId: "user-1", toUserId: "user-2", amount: 10 }, client);
    await giftTokens(
      { fromUserId: "user-1", toUserId: "user-2", amount: 10, requestId: "gift-req-1" },
      client
    );

    expect(seen[0]).toMatchObject({ p_request_id: null });
    expect(seen[1]).toMatchObject({ p_request_id: "gift-req-1" });
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
        // p_request_id is always threaded (null when the caller omits it) so the
        // SECURITY DEFINER function can dedupe a double-submit.
        expect(args).toEqual({ p_reward_id: "reward-1", p_request_id: null });
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

  it("forwards a caller-supplied requestId to the RPC as p_request_id", async () => {
    const client = makeFakeClient({
      onRpc: (_fn, args) => {
        expect(args).toEqual({ p_reward_id: "reward-1", p_request_id: "req-abc" });
        return {
          data: { transaction_id: "tx-1", claim_id: "claim-1", balance_after: 5, cost: 25 },
          error: null,
        };
      },
    });

    await redeemReward(
      { userId: "user-1", rewardId: "reward-1", createdBy: "user-1", requestId: "req-abc" },
      client
    );
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

/**
 * TOK1: models the request-id idempotency guard the NEW gift_tokens() /
 * redeem_reward() migration (20260718000300_tokens_request_id_idempotency.sql)
 * adds -- "if a row already carries this request_id, return the ORIGINAL result
 * and write nothing." The advisory lock (proven above) serializes same-user
 * calls, so under real concurrency the second call runs after the first commits
 * and sees the recorded request_id; the unique partial index on
 * (ref->>'request_id', kind) is the DB backstop. Vitest can't run true
 * concurrent Postgres, so this simulates the guard's decision logic the same
 * way makeConcurrencySimulator above documents the advisory lock.
 */
function makeIdempotentGiftSimulator(senderStart: number) {
  let senderBalance = senderStart;
  let recipientBalance = 0;
  let transfers = 0;
  const processed = new Map<string, { debitId: string; creditId: string; senderBalanceAfter: number }>();
  let seq = 0;

  async function gift(amount: number, requestId: string | null) {
    await Promise.resolve(); // matches the RPC round trip / serialized lock section
    if (amount <= 0) {
      return { status: "rejected" as const, reason: "Amount must be positive" };
    }
    if (requestId != null && processed.has(requestId)) {
      // Duplicate submit: return the first result unchanged, move nothing.
      return { status: "duplicate" as const, ...processed.get(requestId)! };
    }
    if (senderBalance < amount) {
      return { status: "rejected" as const, reason: "Insufficient balance" };
    }
    senderBalance -= amount;
    recipientBalance += amount;
    transfers += 1;
    seq += 1;
    const result = {
      debitId: `debit-${seq}`,
      creditId: `credit-${seq}`,
      senderBalanceAfter: senderBalance,
    };
    if (requestId != null) processed.set(requestId, result);
    return { status: "ok" as const, ...result };
  }

  return {
    gift,
    transfers: () => transfers,
    senderBalance: () => senderBalance,
    recipientBalance: () => recipientBalance,
  };
}

describe("gift idempotency (same request id = one logical transfer)", () => {
  it("a duplicate submit with the same request id moves the balance exactly once and returns the original result", async () => {
    const sim = makeIdempotentGiftSimulator(10);

    const first = await sim.gift(2, "req-A");
    const second = await sim.gift(2, "req-A");

    expect(first.status).toBe("ok");
    expect(second.status).toBe("duplicate");
    // Same debit/credit ids and the same post-gift balance both times.
    expect(second).toMatchObject({
      debitId: (first as { debitId: string }).debitId,
      creditId: (first as { creditId: string }).creditId,
      senderBalanceAfter: 8,
    });
    expect(sim.transfers()).toBe(1);
    expect(sim.senderBalance()).toBe(8);
    expect(sim.recipientBalance()).toBe(2);
  });

  it("different request ids are two distinct transfers", async () => {
    const sim = makeIdempotentGiftSimulator(10);

    await sim.gift(2, "req-A");
    await sim.gift(2, "req-B");

    expect(sim.transfers()).toBe(2);
    expect(sim.senderBalance()).toBe(6);
    expect(sim.recipientBalance()).toBe(4);
  });

  it("still rejects an over-balance gift (idempotency doesn't loosen the balance cap)", async () => {
    const sim = makeIdempotentGiftSimulator(1);
    const result = await sim.gift(5, "req-A");
    expect(result.status).toBe("rejected");
    expect(sim.transfers()).toBe(0);
  });

  it("still rejects a zero or negative gift", async () => {
    const sim = makeIdempotentGiftSimulator(10);
    expect((await sim.gift(0, "req-A")).status).toBe("rejected");
    expect((await sim.gift(-3, "req-B")).status).toBe("rejected");
    expect(sim.transfers()).toBe(0);
  });
});

function makeIdempotentRedeemSimulator(startBalance: number) {
  let balance = startBalance;
  let claims = 0;
  const processed = new Map<string, { txId: string; claimId: string; cost: number; balanceAfter: number }>();
  let seq = 0;

  async function redeem(cost: number, requestId: string | null) {
    await Promise.resolve();
    if (cost <= 0) {
      return { status: "rejected" as const, reason: "Cost must be positive" };
    }
    if (requestId != null && processed.has(requestId)) {
      return { status: "duplicate" as const, ...processed.get(requestId)! };
    }
    if (balance < cost) {
      return { status: "rejected" as const, reason: "Insufficient balance" };
    }
    balance -= cost;
    claims += 1;
    seq += 1;
    const result = { txId: `tx-${seq}`, claimId: `claim-${seq}`, cost, balanceAfter: balance };
    if (requestId != null) processed.set(requestId, result);
    return { status: "ok" as const, ...result };
  }

  return { redeem, claims: () => claims, balance: () => balance };
}

describe("reward-claim idempotency (same request id = one claim)", () => {
  it("a duplicate claim with the same request id debits once, creates one claim, and returns the original", async () => {
    const sim = makeIdempotentRedeemSimulator(30);

    const first = await sim.redeem(25, "claim-req-A");
    const second = await sim.redeem(25, "claim-req-A");

    expect(first.status).toBe("ok");
    expect(second.status).toBe("duplicate");
    expect(second).toMatchObject({
      claimId: (first as { claimId: string }).claimId,
      balanceAfter: 5,
    });
    expect(sim.claims()).toBe(1);
    expect(sim.balance()).toBe(5);
  });

  it("different request ids create two claims and debit twice", async () => {
    const sim = makeIdempotentRedeemSimulator(60);
    await sim.redeem(25, "claim-req-A");
    await sim.redeem(25, "claim-req-B");
    expect(sim.claims()).toBe(2);
    expect(sim.balance()).toBe(10);
  });

  it("still rejects an over-balance claim", async () => {
    const sim = makeIdempotentRedeemSimulator(10);
    const result = await sim.redeem(25, "claim-req-A");
    expect(result.status).toBe("rejected");
    expect(sim.claims()).toBe(0);
    expect(sim.balance()).toBe(10);
  });

  it("still rejects a zero or negative cost", async () => {
    const sim = makeIdempotentRedeemSimulator(30);
    expect((await sim.redeem(0, "claim-req-A")).status).toBe("rejected");
    expect(sim.claims()).toBe(0);
  });
});
