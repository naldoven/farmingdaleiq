import { describe, expect, it } from "vitest";

import { extractRecipientIds } from "@/lib/notify/recipients";
import { mapEventToTaskInsert, type AppEventRow } from "@/app/(app)/tasks/system-tasks";

/**
 * Contract-level integration tests (parity-audit "Canonical event payload
 * contract" fix): these push the REAL `setup_posted` payload shape that
 * postSetup() (app/(app)/setups/actions.ts) emits through the REAL consumer
 * functions, instead of each side fabricating its own fixture shape. Kept as
 * a literal mirror of the emitEvent("setup_posted", {...}) call in
 * actions.ts rather than importing postSetup itself, since exercising the
 * action directly would require mocking the whole Supabase server-client
 * chain for no added contract coverage.
 */
function realSetupPostedPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    setup_id: "11111111-1111-4111-8111-111111111111",
    assignments: [
      { position_id: "pos-1", user_id: "user-a", arrival_time: null },
      { position_id: "pos-2", user_id: "user-b", arrival_time: null },
    ],
    user_ids: ["user-a", "user-b"],
    leader_user_id: "leader-1",
    actor_id: "poster-1",
    ...overrides,
  };
}

describe("setup_posted contract: notifications recipient extraction", () => {
  it("resolves every assigned person as a recipient from the real payload", () => {
    const payload = realSetupPostedPayload();
    expect(extractRecipientIds(payload)).toEqual(expect.arrayContaining(["user-a", "user-b"]));
  });

  it("does not treat the actor or leader as an unintended extra recipient", () => {
    const payload = realSetupPostedPayload();
    const recipients = extractRecipientIds(payload);
    // leader_user_id / actor_id aren't in the recognized recipient key list,
    // so only the assigned user_ids resolve — confirms the fields are
    // additive, not accidentally double-counted.
    expect(recipients).toHaveLength(2);
  });
});

describe("setup_posted contract: tasks lead_duty system-task creation", () => {
  it("creates a lead_duty task assigned to the real leader_user_id", () => {
    const event: AppEventRow = {
      id: "evt-setup-posted-1",
      event_key: "setup_posted",
      payload: realSetupPostedPayload(),
      created_at: "2026-07-10T12:00:00.000Z",
    };
    const insert = mapEventToTaskInsert(event);
    expect(insert).toMatchObject({
      kind: "lead_duty",
      assigned_user_id: "leader-1",
    });
  });

  it("skips lead_duty creation when the real payload has no leader (edge case, not the normal path)", () => {
    const event: AppEventRow = {
      id: "evt-setup-posted-2",
      event_key: "setup_posted",
      payload: realSetupPostedPayload({ leader_user_id: null }),
      created_at: "2026-07-10T12:00:00.000Z",
    };
    expect(mapEventToTaskInsert(event)).toBeNull();
  });
});
