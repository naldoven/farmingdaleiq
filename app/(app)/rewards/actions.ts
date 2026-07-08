"use server";

/**
 * Rewards server actions. Follows the reference pattern in
 * app/(app)/people/actions.ts: every action calls requirePermission()
 * before touching the DB, mutations go through the per-request client so
 * Postgres RLS (supabase/migrations/20260707030000_tokens_rewards_feed_rls.sql)
 * independently re-checks the same permission, and every action returns a
 * discriminated ActionResult instead of throwing.
 *
 * Idempotency / money-math note (PLAN.md hard boundary: "any action that
 * can be double-submitted ... must be safe to run twice"; "Money paths
 * (tokens): never store a balance; always compute from the ledger;
 * validate inside a transaction"): claimReward delegates to
 * lib/tokens/ledger.ts redeemReward(), which calls the redeem_reward() SQL
 * function (per-user advisory lock + `for update` on the reward row, balance
 * and stock re-checked atomically) -- see that migration's header comment
 * and lib/tokens/ledger.test.ts's concurrency simulation for the "two
 * concurrent claims can't overspend" proof. fulfillClaim's update is
 * naturally idempotent: it's scoped to `status = 'pending'`, so calling it
 * twice on an already-delivered claim is a no-op, not a double delivery.
 *
 * Fulfillment-task creation is explicitly NOT done here: `tasks` is owned
 * by S2 (docs/agent-map.md), so claimReward only emits a `reward_claim`
 * event; the P2 wiring agent / S2's task consumer is expected to create the
 * kind="reward_fulfillment" task and (separately) set
 * reward_claims.fulfillment_task_id.
 */

import { revalidatePath } from "next/cache";

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { cancelRewardClaim, redeemReward } from "@/lib/tokens/ledger";
import { emitEvent } from "@/lib/events/bus";
import type { ActionResult } from "@/app/(app)/rewards/action-types";
import {
  claimIdSchema,
  claimRewardSchema,
  createRewardSchema,
  updateRewardSchema,
  type ClaimIdInput,
  type ClaimRewardInput,
  type CreateRewardInput,
  type UpdateRewardInput,
} from "@/app/(app)/rewards/validation";

function toActionError(error: unknown): string {
  if (error instanceof PermissionError) {
    return "You don't have permission to do this.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

/**
 * emitEvent() is best-effort here: the ledger/claim mutation above it
 * already committed, so a failure to record the event must not surface as
 * an action failure. Same "emitEventSafely" precedent as
 * app/api/cron/checklists/route.ts (S1).
 */
async function emitEventSafely(key: Parameters<typeof emitEvent>[0], payload: Record<string, unknown>) {
  try {
    await emitEvent(key, payload);
  } catch (error) {
    console.error(`rewards actions: emitEvent(${key}) failed`, error);
  }
}

/**
 * Claims a reward (ARCHITECTURE.md "Tokens & Rewards": "Claiming a reward
 * debits the balance and creates a fulfillment task for leaders to deliver
 * it"). `rewards.claim` is a base permission granted to every seeded role.
 */
export async function claimReward(
  input: ClaimRewardInput
): Promise<ActionResult<{ claimId: string; balanceAfter: number }>> {
  try {
    await requirePermission("rewards.claim");

    const parsed = claimRewardSchema.parse(input);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "Not signed in." };
    }

    const { data: reward } = await supabase
      .from("rewards")
      .select("name, token_cost")
      .eq("id", parsed.rewardId)
      .maybeSingle();

    const result = await redeemReward(
      { userId: user.id, rewardId: parsed.rewardId, createdBy: user.id },
      supabase
    );

    await emitEventSafely("reward_claim", {
      claim_id: result.claimId,
      user_id: user.id,
      reward_id: parsed.rewardId,
      reward_name: reward?.name ?? null,
      cost: result.cost,
    });

    revalidatePath("/rewards");
    revalidatePath("/tokens");
    return { ok: true, data: { claimId: result.claimId, balanceAfter: result.balanceAfter } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Marks a pending claim delivered (rewards.fulfill). Scoped to
 * status = 'pending' so a repeated call (double-click, retry) is a no-op
 * rather than a second delivery.
 */
export async function fulfillClaim(input: ClaimIdInput): Promise<ActionResult> {
  try {
    await requirePermission("rewards.fulfill");

    const parsed = claimIdSchema.parse(input);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Scoped to status = 'pending' and returning the claimant so (a) a repeated
    // call is a no-op that transitions no row (data is null) and emits nothing,
    // and (b) the event carries the claimant as `user_id` -- the recipient key
    // lib/notify's extractor recognizes -- so the "your reward is ready"
    // notification can actually reach them (it previously carried no recipient).
    const { data: delivered, error } = await supabase
      .from("reward_claims")
      .update({ status: "delivered", delivered_by: user?.id ?? null, delivered_at: new Date().toISOString() })
      .eq("id", parsed.claimId)
      .eq("status", "pending")
      .select("user_id")
      .maybeSingle();

    if (error) {
      return { ok: false, error: error.message };
    }

    if (delivered?.user_id) {
      await emitEventSafely("reward_fulfilled", {
        claim_id: parsed.claimId,
        user_id: delivered.user_id,
        delivered_by: user?.id ?? null,
      });
    }

    revalidatePath("/rewards");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Cancels a pending claim and refunds the ledger (rewards.fulfill /
 * rewards.manage), via the cancel_reward_claim() SQL function (atomic:
 * status flip + restock + refund transaction, guarded to a `pending` claim
 * only).
 */
export async function cancelClaim(
  input: ClaimIdInput
): Promise<ActionResult<{ balanceAfter: number }>> {
  try {
    await requirePermission("rewards.fulfill");

    const parsed = claimIdSchema.parse(input);
    const supabase = await createClient();

    const result = await cancelRewardClaim(parsed.claimId, supabase);

    revalidatePath("/rewards");
    revalidatePath("/tokens");
    return { ok: true, data: { balanceAfter: result.balanceAfter } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Creates a reward (rewards.manage). */
export async function createReward(input: CreateRewardInput): Promise<ActionResult> {
  try {
    await requirePermission("rewards.manage");

    const parsed = createRewardSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("rewards").insert({
      name: parsed.name,
      description: parsed.description ? parsed.description : null,
      image_url: parsed.imageUrl ? parsed.imageUrl : null,
      token_cost: parsed.tokenCost,
      stock: parsed.stock,
      active: parsed.active,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/rewards");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Edits a reward, including retiring it (active: false) (rewards.manage). */
export async function updateReward(input: UpdateRewardInput): Promise<ActionResult> {
  try {
    await requirePermission("rewards.manage");

    const parsed = updateRewardSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("rewards")
      .update({
        name: parsed.name,
        description: parsed.description ? parsed.description : null,
        image_url: parsed.imageUrl ? parsed.imageUrl : null,
        token_cost: parsed.tokenCost,
        stock: parsed.stock,
        active: parsed.active,
      })
      .eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/rewards");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
