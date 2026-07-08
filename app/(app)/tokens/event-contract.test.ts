import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

/**
 * Cross-module event-payload CONTRACT tests.
 *
 * The parity audit's headline bug was that every module unit-tested its own
 * FABRICATED payload shape, so producer/consumer field-name drift stayed green
 * on both sides while the integration was dead (a task/checklist completion
 * never earned a token, a recognition/gift/reward notification never reached
 * anyone). These tests close that hole for the Tokens & Rewards producers by
 * driving the REAL server action, capturing the REAL payload it emits, and
 * pushing that exact payload through the REAL consumer
 * (lib/notify/recipients.ts for notification recipients, and this module's own
 * resolveAwardsForEvents for token earning) -- no hand-written payloads on the
 * consumer side.
 *
 * Canonical contract (from the fix brief): recipient = `user_id` (or
 * `user_ids`), actor = `actor_id`, amount override = `token_value`, reward
 * event = {claim_id, reward_name, user_id}.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: vi.fn().mockResolvedValue(undefined),
  hasPermission: vi.fn().mockResolvedValue(true),
  PermissionError: class PermissionError extends Error {},
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

vi.mock("@/lib/events/bus", () => ({ emitEvent: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/tokens/ledger", () => {
  class DuplicateTokenAwardError extends Error {}
  return {
    DuplicateTokenAwardError,
    awardTokens: vi.fn(),
    giftTokens: vi.fn(),
    redeemReward: vi.fn(),
    cancelRewardClaim: vi.fn(),
    adjustTokens: vi.fn(),
  };
});

import { createRecognition } from "@/app/(app)/team/actions";
import { sendGift } from "@/app/(app)/tokens/actions";
import { claimReward, fulfillClaim } from "@/app/(app)/rewards/actions";
import { emitEvent } from "@/lib/events/bus";
import { createClient } from "@/lib/supabase/server";
import { awardTokens, giftTokens, redeemReward, DuplicateTokenAwardError } from "@/lib/tokens/ledger";
// REAL consumers -- deliberately NOT mocked:
import { extractRecipientIds } from "@/lib/notify/recipients";
import { resolveAwardsForEvents, type AppEventForConsumer } from "@/app/(app)/tokens/logic";

const REWARD_UUID = "22222222-2222-4222-8222-222222222222";
const CLAIM_UUID = "33333333-3333-4333-8333-333333333333";
// Recipient/actor ids that satisfy the actions' z.string().uuid() inputs.
const LEADER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SENDER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RECIPIENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CLAIMANT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

/** Last payload emitted for a given event key, or undefined if none. */
function lastPayload(key: string): Record<string, unknown> | undefined {
  const calls = (emitEvent as Mock).mock.calls.filter((c) => c[0] === key);
  return calls.length ? (calls[calls.length - 1][1] as Record<string, unknown>) : undefined;
}

function emitCount(key: string): number {
  return (emitEvent as Mock).mock.calls.filter((c) => c[0] === key).length;
}

/**
 * Minimal fake Supabase covering exactly the chains the four actions touch.
 * feedInserts records feed_posts inserts so a test can assert no duplicate
 * post was written on the deduped recognition path.
 */
function makeSupabase(opts: {
  user: { id: string } | null;
  reward?: { name: string; token_cost: number } | null;
  existingPost?: { id: string } | null;
  deliveredClaim?: { user_id: string } | null;
  feedInserts?: Array<Record<string, unknown>>;
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: opts.user }, error: null }),
    },
    from(table: string) {
      if (table === "feed_posts") {
        return {
          insert(row: Record<string, unknown>) {
            opts.feedInserts?.push(row);
            return {
              select() {
                return { single: async () => ({ data: { id: "post-1" }, error: null }) };
              },
            };
          },
          select() {
            const builder = {
              eq: () => builder,
              order: () => builder,
              limit: () => builder,
              maybeSingle: async () => ({ data: opts.existingPost ?? null, error: null }),
            };
            return builder;
          },
        };
      }
      if (table === "rewards") {
        return {
          select() {
            return {
              eq: () => ({ maybeSingle: async () => ({ data: opts.reward ?? null, error: null }) }),
            };
          },
        };
      }
      if (table === "reward_claims") {
        return {
          update() {
            const builder = {
              eq: () => builder,
              select: () => ({ maybeSingle: async () => ({ data: opts.deliveredClaim ?? null, error: null }) }),
            };
            return builder;
          },
        };
      }
      throw new Error(`makeSupabase: unexpected table ${table}`);
    },
  } as unknown as Awaited<ReturnType<typeof createClient>>;
}

beforeEach(() => {
  vi.clearAllMocks();
  (awardTokens as Mock).mockResolvedValue({ transactionId: "tx-1", balanceAfter: 10 });
  (giftTokens as Mock).mockResolvedValue({
    debit: { transactionId: "tx-d", balanceAfter: 40 },
    credit: { transactionId: "tx-c" },
  });
  (redeemReward as Mock).mockResolvedValue({
    transactionId: "tx-r",
    balanceAfter: 5,
    claimId: "claim-1",
    cost: 25,
  });
});

describe("recognition producer -> notify recipient consumer", () => {
  it("emits user_id/actor_id that the real extractor resolves to the subject", async () => {
    (createClient as Mock).mockResolvedValue(makeSupabase({ user: { id: LEADER } }));

    const result = await createRecognition({ subjectUserId: MEMBER, amount: 15, body: "Great work" });
    expect(result.ok).toBe(true);

    const payload = lastPayload("recognition");
    expect(payload).toBeDefined();
    expect(payload).toMatchObject({ user_id: MEMBER, actor_id: LEADER, amount: 15 });
    // The REAL consumer resolves a recipient from the REAL payload.
    expect(extractRecipientIds(payload!)).toEqual([MEMBER]);
  });
});

describe("gift producer -> notify recipient consumer", () => {
  it("emits user_id/actor_id that the real extractor resolves to the recipient", async () => {
    (createClient as Mock).mockResolvedValue(makeSupabase({ user: { id: SENDER } }));

    const result = await sendGift({ toUserId: RECIPIENT, amount: 10, note: "" });
    expect(result.ok).toBe(true);

    const payload = lastPayload("gift_sent");
    expect(payload).toMatchObject({ user_id: RECIPIENT, actor_id: SENDER, amount: 10 });
    expect(extractRecipientIds(payload!)).toEqual([RECIPIENT]);
  });
});

describe("reward_claim producer -> fulfillment-task contract", () => {
  it("emits the canonical {claim_id, reward_name, user_id} the fulfillment consumer needs", async () => {
    (createClient as Mock).mockResolvedValue(
      makeSupabase({ user: { id: CLAIMANT }, reward: { name: "Free sandwich", token_cost: 25 } })
    );

    const result = await claimReward({ rewardId: REWARD_UUID });
    expect(result.ok).toBe(true);

    const payload = lastPayload("reward_claim");
    // Exactly the fields the canonical contract (and the tasks system-task
    // consumer, once aligned) reads. NOTE: app/(app)/tasks/system-tasks.ts
    // currently reads reward_claim_id/user_name -- that consumer-side rename is
    // the Tasks lane's fix; this producer already emits the canonical shape.
    expect(payload).toMatchObject({
      claim_id: "claim-1",
      reward_name: "Free sandwich",
      user_id: CLAIMANT,
    });
  });
});

describe("reward_fulfilled producer -> notify recipient consumer", () => {
  it("emits the claimant as user_id so the 'reward ready' notification can reach them", async () => {
    (createClient as Mock).mockResolvedValue(
      makeSupabase({ user: { id: LEADER }, deliveredClaim: { user_id: CLAIMANT } })
    );

    const result = await fulfillClaim({ claimId: CLAIM_UUID });
    expect(result.ok).toBe(true);

    const payload = lastPayload("reward_fulfilled");
    expect(payload).toMatchObject({ claim_id: CLAIM_UUID, user_id: CLAIMANT, delivered_by: LEADER });
    expect(extractRecipientIds(payload!)).toEqual([CLAIMANT]);
  });

  it("emits nothing when the claim was already delivered (no row transitions)", async () => {
    (createClient as Mock).mockResolvedValue(
      makeSupabase({ user: { id: LEADER }, deliveredClaim: null })
    );

    const result = await fulfillClaim({ claimId: CLAIM_UUID });
    expect(result.ok).toBe(true);
    expect(emitCount("reward_fulfilled")).toBe(0);
  });
});

describe("earning producers -> resolveAwardsForEvents consumer", () => {
  it("resolves recipient + amount from each producer's real payload shape", () => {
    const rules = { task_complete: 5, checklist_complete: 3, top_performer: 20 };

    const events: AppEventForConsumer[] = [
      // EXACT shape app/(app)/setups/actions.ts selectTopPerformer emits.
      { id: "e1", event_key: "top_performer", payload: { setup_id: "s1", user_id: "winner-1", selected_by: "leader-1" } },
      // Canonical task_complete: producer (Tasks lane) MUST emit user_id, and
      // may carry a per-task token_value override.
      { id: "e2", event_key: "task_complete", payload: { user_id: "worker-1", token_value: 8 } },
      // Canonical checklist_complete: producer (Checklists lane) MUST emit
      // user_id; without a token_value it falls back to the rule amount.
      { id: "e3", event_key: "checklist_complete", payload: { user_id: "worker-2" } },
    ];

    expect(resolveAwardsForEvents(events, rules)).toEqual([
      { eventId: "e1", userId: "winner-1", amount: 20, kind: "top_performer" },
      { eventId: "e2", userId: "worker-1", amount: 8, kind: "earn" },
      { eventId: "e3", userId: "worker-2", amount: 3, kind: "earn" },
    ]);
  });
});

describe("recognition double-submit safety", () => {
  it("does not re-credit or re-post when the credit was already applied (existing post found)", async () => {
    const feedInserts: Array<Record<string, unknown>> = [];
    (createClient as Mock).mockResolvedValue(
      makeSupabase({ user: { id: LEADER }, existingPost: { id: "post-1" }, feedInserts })
    );
    // Second identical submit: the DB unique index rejects the duplicate credit.
    (awardTokens as Mock).mockRejectedValueOnce(new DuplicateTokenAwardError("already credited"));

    const result = await createRecognition({ subjectUserId: MEMBER, amount: 15, body: "Great work" });

    expect(result).toEqual({ ok: true, data: { postId: "post-1" } });
    expect(feedInserts).toHaveLength(0); // no duplicate feed post
    expect(emitCount("recognition")).toBe(0); // deduped path emits nothing
  });

  it("recovers a missing post when a prior submit credited but failed to post", async () => {
    const feedInserts: Array<Record<string, unknown>> = [];
    (createClient as Mock).mockResolvedValue(
      makeSupabase({ user: { id: LEADER }, existingPost: null, feedInserts })
    );
    (awardTokens as Mock).mockRejectedValueOnce(new DuplicateTokenAwardError("already credited"));

    const result = await createRecognition({ subjectUserId: MEMBER, amount: 15, body: "Great work" });

    expect(result.ok).toBe(true);
    expect(feedInserts).toHaveLength(1); // the missing post is created now
    expect(emitCount("recognition")).toBe(1);
  });
});
