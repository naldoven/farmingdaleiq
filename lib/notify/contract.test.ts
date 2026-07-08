import { describe, expect, it, vi, beforeEach } from "vitest";

import type {
  EventKey,
  RecipientFields,
  RewardClaimPayload,
  FollowUpPayload,
} from "@/lib/events/bus";
import { FakeSupabase } from "@/lib/notify/test-support/fake-supabase";
import { extractRecipientIds } from "./recipients";
import { processAppEvents } from "./events";

/**
 * Contract-level integration tests for the notification side of the canonical
 * event-payload contract (lib/events/bus.ts).
 *
 * The parity audit's root cause was that each side unit-tested its OWN
 * fabricated payload shape, so producer and consumer could both stay green
 * while the real field names never lined up. These tests instead build
 * payloads typed against the CANONICAL contract interfaces exported from
 * lib/events/bus.ts and push them through the REAL recipient extractor and
 * the REAL `processAppEvents` consumer. Because each payload is typed, a
 * future rename of `user_id` (or a drift back to `completed_by`/`to_user_id`)
 * breaks compilation here rather than silently dropping notifications in
 * production.
 */

const { sendWebPushMock } = vi.hoisted(() => ({ sendWebPushMock: vi.fn() }));

vi.mock("@/lib/notify/push", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notify/push")>("@/lib/notify/push");
  return { ...actual, sendWebPush: sendWebPushMock };
});

beforeEach(() => {
  sendWebPushMock.mockReset();
  sendWebPushMock.mockResolvedValue(undefined);
});

const RECIPIENT = "user-recipient";

// One canonical payload per notifiable, recipient-bearing event key. Each is
// typed so the field name is compiler-enforced against the canonical contract.
const rewardClaim: RewardClaimPayload = {
  claim_id: "claim-1",
  reward_name: "Free combo",
  user_id: RECIPIENT,
};

const followUp: FollowUpPayload = {
  follow_up_id: "fu-1",
  source_answer_id: "ans-1",
  run_id: "run-1",
  title: "Re-check walk-in temp",
  description: "Walk-in read out of range; verify and log.",
  user_id: RECIPIENT,
  actor_id: "actor-1",
};

const singleRecipient: RecipientFields = { user_id: RECIPIENT };

const CASES: Array<{ key: EventKey; payload: Record<string, unknown> }> = [
  { key: "task_assigned", payload: { ...singleRecipient } },
  { key: "recognition", payload: { ...singleRecipient } },
  { key: "gift_sent", payload: { ...singleRecipient } },
  { key: "reward_claim", payload: { ...rewardClaim } },
  { key: "reward_fulfilled", payload: { ...singleRecipient } },
  { key: "follow_up_assigned", payload: { ...followUp } },
  { key: "training_assigned", payload: { ...singleRecipient } },
];

describe("canonical payload contract: recipient resolution", () => {
  it.each(CASES)("extractRecipientIds resolves the canonical recipient for %o", ({ payload }) => {
    expect(extractRecipientIds(payload)).toContain(RECIPIENT);
  });

  it.each(CASES)(
    "processAppEvents creates an in-app notification for the canonical recipient of %o",
    async ({ key, payload }) => {
      const db = new FakeSupabase({
        app_events: [
          { id: `evt-${key}`, event_key: key, created_at: "2026-07-07T10:00:00.000Z", payload },
        ],
        job_cursors: [],
        notifications: [],
        push_subscriptions: [],
        profiles: [],
      });
      const client = db as unknown as Parameters<typeof processAppEvents>[1];

      const result = await processAppEvents(200, client);

      expect(result.notificationsCreated).toBe(1);
      expect(db.rowsOf("notifications")[0]).toMatchObject({ user_id: RECIPIENT, kind: key });
    },
  );
});
