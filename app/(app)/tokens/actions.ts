"use server";

/**
 * Tokens server actions. Follows the reference pattern in
 * app/(app)/people/actions.ts (see that file's header comment for the full
 * rationale): every action calls requirePermission() before touching the
 * DB, mutations go through the per-request client so Postgres RLS
 * (supabase/migrations/20260707030000_tokens_rewards_feed_rls.sql)
 * independently re-checks the same permission (or, for gift_tokens, the
 * SECURITY DEFINER function re-derives the caller from auth.uid() itself),
 * and every action returns a discriminated ActionResult instead of
 * throwing.
 *
 * Money-math note: sendGift never computes a balance itself -- it delegates
 * to lib/tokens/ledger.ts giftTokens(), which calls the gift_tokens() SQL
 * function (per-user advisory lock, re-checked balance) so a double-submit
 * can't overspend (PLAN.md hard boundary: "Money paths (tokens): never
 * store a balance; always compute from the ledger; validate inside a
 * transaction").
 */

import { revalidatePath } from "next/cache";

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { giftTokens } from "@/lib/tokens/ledger";
import { emitEvent } from "@/lib/events/bus";
import type { ActionResult } from "@/app/(app)/tokens/action-types";
import {
  giftTokensSchema,
  updateEarningRuleSchema,
  type GiftTokensInput,
  type UpdateEarningRuleInput,
} from "@/app/(app)/tokens/validation";

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
 * emitEvent() is best-effort here: the ledger mutation above it already
 * committed, so a failure to record the event (e.g. app_events has no RLS
 * insert policy for a per-request client yet -- see this stream's final
 * report) must not surface as an action failure and mislead the caller into
 * thinking the gift didn't happen. Same "emitEventSafely" precedent as
 * app/api/cron/checklists/route.ts (S1).
 */
async function emitEventSafely(key: Parameters<typeof emitEvent>[0], payload: Record<string, unknown>) {
  try {
    await emitEvent(key, payload);
  } catch (error) {
    console.error(`tokens actions: emitEvent(${key}) failed`, error);
  }
}

/**
 * Gifts tokens from the signed-in user to a coworker (ARCHITECTURE.md
 * "Tokens & Rewards": "Anyone can gift their own tokens to a coworker
 * (capped by their balance)"). `tokens.gift` is a base permission granted to
 * every seeded role.
 */
export async function sendGift(
  input: GiftTokensInput
): Promise<ActionResult<{ balanceAfter: number }>> {
  try {
    await requirePermission("tokens.gift");

    const parsed = giftTokensSchema.parse(input);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "Not signed in." };
    }

    if (parsed.toUserId === user.id) {
      return { ok: false, error: "You can't gift tokens to yourself." };
    }

    const result = await giftTokens(
      {
        fromUserId: user.id,
        toUserId: parsed.toUserId,
        amount: parsed.amount,
        note: parsed.note ? parsed.note : undefined,
      },
      supabase
    );

    await emitEventSafely("gift_sent", {
      from_user_id: user.id,
      to_user_id: parsed.toUserId,
      amount: parsed.amount,
    });

    revalidatePath("/tokens");
    return { ok: true, data: { balanceAfter: result.debit.balanceAfter } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Creates or edits a token_earning_rules row (event_key -> amount).
 * tokens.manage only. Used to tune how many tokens a task/checklist
 * completion is worth, or the Top Performer bonus.
 */
export async function updateEarningRule(
  input: UpdateEarningRuleInput
): Promise<ActionResult> {
  try {
    await requirePermission("tokens.manage");

    const parsed = updateEarningRuleSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("token_earning_rules")
      .upsert({ event_key: parsed.eventKey, amount: parsed.amount });

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/tokens");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
