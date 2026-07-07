import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";
import { readAdminInfo } from "../fixtures/admin-info";
import { serviceRoleClient } from "../fixtures/service-role";

/**
 * Rewards happy path (PLAN.md S7 "Done": "... claim reward -> ledger debit +
 * fulfillment task ..."). global-setup.ts gives the admin test user a 500
 * token starting balance specifically so this spec has something to spend
 * against a real seeded reward (supabase/migrations/20260707001900_seed_
 * store_config.sql: "Cookie/Brownie (TM)" costs 25).
 *
 * Cleanup contract: this spec does NOT delete the reward_claims/
 * token_transactions rows it creates -- e2e/global-teardown.ts's own
 * contract already covers both of those tables for the admin test user
 * before it deletes that user, so a second delete here would just be
 * redundant. Every OTHER spec's fixtures (setups, checklist runs, catering
 * orders) get their own afterAll because those tables are NOT part of that
 * global contract.
 */
test.describe("rewards: claim a reward", () => {
  // A retry of this test would claim the reward a second time (redeem_reward()
  // has no client-supplied idempotency key -- by design, a real second claim
  // click is a real second claim), which would desync the balance/ledger
  // assertions below from what a single retry expects. Safer to fail once
  // than to auto-retry into a confusing double-claim.
  test.describe.configure({ retries: 0 });

  let admin: SupabaseClient<Database>;
  let adminUserId: string;
  let rewardId: string;
  let rewardCost: number;

  test.beforeAll(async () => {
    admin = serviceRoleClient();
    adminUserId = readAdminInfo().userId;

    const { data: reward, error } = await admin
      .from("rewards")
      .select("id, token_cost")
      .eq("name", "Cookie/Brownie (TM)")
      .maybeSingle();
    if (error || !reward) throw new Error(`fixture: seeded reward "Cookie/Brownie (TM)" not found: ${error?.message}`);
    rewardId = reward.id;
    rewardCost = reward.token_cost;
  });

  test("claiming a reward debits the ledger and records a claim", async ({ page }) => {
    const { data: balanceRows } = await admin.from("token_transactions").select("delta").eq("user_id", adminUserId);
    const balanceBefore = (balanceRows ?? []).reduce((sum, t) => sum + t.delta, 0);

    await page.goto("/rewards");
    // exact: true -- otherwise this also matches the admin-only "Manage
    // rewards" section heading (substring match), since our fixture admin
    // has rewards.manage.
    await expect(page.getByRole("heading", { name: "Rewards", exact: true })).toBeVisible();
    await expect(page.getByText(`${balanceBefore} tokens`)).toBeVisible();

    // Scope to the specific RewardCard by its own root element (shadcn's
    // base Card component, shared across every Card on this page) filtered
    // down to the one containing this reward's own title -- the admin-only
    // "Manage rewards" list below also mentions this reward's name, but as a
    // plain <span>, not a heading, so it doesn't collide with this filter.
    const rewardCard = page
      .locator(".rounded-xl")
      .filter({ has: page.getByRole("heading", { name: "Cookie/Brownie (TM)", exact: true }) });
    await rewardCard.getByRole("button", { name: "Claim" }).click();

    await expect(rewardCard.getByRole("button", { name: "Claimed" })).toBeVisible();
    await expect(page.getByText(`${balanceBefore - rewardCost} tokens`)).toBeVisible();

    const { data: claim } = await admin
      .from("reward_claims")
      .select("id, cost, status, user_id")
      .eq("reward_id", rewardId)
      .eq("user_id", adminUserId)
      .order("claimed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(claim?.cost).toBe(rewardCost);
    expect(claim?.status).toBe("pending");

    const { data: transactions } = await admin
      .from("token_transactions")
      .select("delta, kind")
      .eq("user_id", adminUserId)
      .eq("kind", "redeem");
    const totalRedeemed = (transactions ?? []).reduce((sum, t) => sum + t.delta, 0);
    expect(totalRedeemed).toBe(-rewardCost);
  });
});
