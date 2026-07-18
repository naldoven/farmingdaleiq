import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/events/bus", () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}));

import { emitEvent } from "@/lib/events/bus";
import { extractRecipientIds } from "@/lib/notify/recipients";
import type { Database } from "@/lib/db/types";
import {
  followUpSourceAnswerId,
  mapEventToTaskInsert,
  processTaskEvents,
  type AppEventRow,
  type ResolvedFollowUp,
} from "./system-tasks";

const CREATED_AT = "2026-07-10T12:00:00.000Z";

describe("mapEventToTaskInsert", () => {
  it("maps a reward_claim event (real rewards payload) to a reward_fulfillment task", () => {
    // The exact shape emitted by rewards.claimReward (app/(app)/rewards/actions.ts).
    const event: AppEventRow = {
      id: "evt-1",
      event_key: "reward_claim",
      payload: {
        claim_id: "claim-1",
        user_id: "user-9",
        reward_id: "reward-1",
        reward_name: "Free sandwich",
        cost: 50,
      },
      created_at: CREATED_AT,
    };
    const insert = mapEventToTaskInsert(event);
    expect(insert).toMatchObject({
      kind: "reward_fulfillment",
      title: "Fulfill reward: Free sandwich",
      date: "2026-07-10",
      ref: {
        event_id: "evt-1",
        source: "reward_claim",
        reward_claim_id: "claim-1",
        claimed_by: "user-9",
      },
    });
  });

  it("skips a reward_claim event missing claim_id", () => {
    const event: AppEventRow = {
      id: "evt-2",
      event_key: "reward_claim",
      payload: { reward_name: "Free sandwich" },
      created_at: CREATED_AT,
    };
    expect(mapEventToTaskInsert(event)).toBeNull();
  });

  it("maps a follow_up_assigned event (real checklist payload) using resolved content", () => {
    // The exact shape emitted by checklists.completeRun: camelCase, keys only.
    const event: AppEventRow = {
      id: "evt-3",
      event_key: "follow_up_assigned",
      payload: { sourceAnswerId: "ans-1", runId: "run-1" },
      created_at: CREATED_AT,
    };
    const followUp: ResolvedFollowUp = {
      followUpId: "fu-1",
      questionPrompt: "Recheck cold holding",
      description: "Follow up on a flagged checklist answer.",
      assignedUserId: "user-1",
      dueAt: "2026-07-11T15:00:00.000Z",
    };
    const insert = mapEventToTaskInsert(event, { followUp });
    expect(insert).toMatchObject({
      kind: "follow_up",
      title: "Follow-up: Recheck cold holding",
      description: "Follow up on a flagged checklist answer.",
      assigned_user_id: "user-1",
      assigned_position_id: null,
      due_at: "2026-07-11T15:00:00.000Z",
      ref: {
        follow_up_id: "fu-1",
        source_answer_id: "ans-1",
        run_id: "run-1",
      },
    });
  });

  it("falls back to a default title for follow_up_assigned with no resolved content", () => {
    const event: AppEventRow = {
      id: "evt-4",
      event_key: "follow_up_assigned",
      payload: { sourceAnswerId: "ans-2", runId: "run-2" },
      created_at: CREATED_AT,
    };
    expect(mapEventToTaskInsert(event)?.title).toBe("Follow-up needed");
  });

  it("maps a setup_posted event to a lead_duty task when a leader is present", () => {
    const event: AppEventRow = {
      id: "evt-5",
      event_key: "setup_posted",
      payload: { setup_id: "setup-1", leader_user_id: "leader-1", day_part_id: "dp-1" },
      created_at: CREATED_AT,
    };
    const insert = mapEventToTaskInsert(event);
    expect(insert).toMatchObject({
      kind: "lead_duty",
      title: "Lead Duties",
      assigned_user_id: "leader-1",
      day_part_id: "dp-1",
    });
  });

  it("skips setup_posted with no identifiable leader", () => {
    const event: AppEventRow = {
      id: "evt-6",
      event_key: "setup_posted",
      payload: { setup_id: "setup-1" },
      created_at: CREATED_AT,
    };
    expect(mapEventToTaskInsert(event)).toBeNull();
  });

  it("returns null for an event key it does not handle", () => {
    const event: AppEventRow = {
      id: "evt-7",
      event_key: "checklist_complete",
      payload: {},
      created_at: CREATED_AT,
    };
    expect(mapEventToTaskInsert(event)).toBeNull();
  });
});

describe("followUpSourceAnswerId", () => {
  it("reads the canonical snake_case key", () => {
    expect(followUpSourceAnswerId({ source_answer_id: "a" })).toBe("a");
  });
  it("reads the checklist producer's camelCase key", () => {
    expect(followUpSourceAnswerId({ sourceAnswerId: "b" })).toBe("b");
  });
  it("returns undefined when neither is present", () => {
    expect(followUpSourceAnswerId({})).toBeUndefined();
  });
});

// Minimal fake Supabase covering exactly the chains processTaskEvents uses.
function fakeSupabase(opts: {
  events: AppEventRow[];
  existingRefs: Array<Record<string, unknown> | null>;
  captured: Array<Record<string, unknown>>;
  followUps?: FollowUpRow[];
}) {
  const { events, existingRefs, captured, followUps = [] } = opts;
  let nextId = 100;
  return {
    from(table: string) {
      if (table === "app_events") {
        return {
          select() {
            return {
              in() {
                return {
                  order() {
                    return {
                      limit(n: number) {
                        return Promise.resolve({ data: events.slice(0, n), error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "follow_ups") {
        return {
          select() {
            return {
              in(_col: string, ids: string[]) {
                return Promise.resolve({
                  data: followUps.filter((f) => ids.includes(f.source_answer_id ?? "")),
                  error: null,
                });
              },
            };
          },
        };
      }
      if (table === "tasks") {
        return {
          select() {
            return {
              in() {
                return Promise.resolve({
                  data: existingRefs.map((ref) => ({ ref })),
                  error: null,
                });
              },
            };
          },
          insert(row: Record<string, unknown>) {
            return {
              select() {
                return {
                  single() {
                    const id = `task-${nextId++}`;
                    // Mirror the real `.select("id, kind, ref, assigned_user_id")`
                    // so the N2 recipient wiring can be exercised.
                    const created = {
                      id,
                      kind: row.kind,
                      ref: row.ref,
                      assigned_user_id: row.assigned_user_id ?? null,
                    };
                    captured.push({ ...row, id });
                    return Promise.resolve({ data: created, error: null });
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`fakeSupabase: unexpected table ${table}`);
    },
  } as unknown as SupabaseClient<Database>;
}

interface FollowUpRow {
  id: string;
  source_answer_id: string | null;
  description: string | null;
  assigned_to: string | null;
  due_at: string | null;
  checklist_answers: { checklist_questions: { prompt: string | null } | null } | null;
}

describe("processTaskEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a task for a new event and emits task_assigned", async () => {
    const events: AppEventRow[] = [
      {
        id: "evt-1",
        event_key: "reward_claim",
        payload: { claim_id: "claim-1", user_id: "user-9", reward_name: "Free sandwich" },
        created_at: CREATED_AT,
      },
    ];
    const captured: Array<Record<string, unknown>> = [];
    const supabase = fakeSupabase({ events, existingRefs: [], captured });

    const result = await processTaskEvents(supabase);

    expect(result).toEqual({ created: 1, skipped: 0 });
    expect(captured).toHaveLength(1);
    expect(emitEvent).toHaveBeenCalledWith(
      "task_assigned",
      expect.objectContaining({ kind: "reward_fulfillment" }),
    );
  });

  it("resolves follow-up content from the DB and creates a traceable task", async () => {
    const events: AppEventRow[] = [
      {
        id: "evt-fu",
        event_key: "follow_up_assigned",
        payload: { sourceAnswerId: "ans-1", runId: "run-1" },
        created_at: CREATED_AT,
      },
    ];
    const captured: Array<Record<string, unknown>> = [];
    const supabase = fakeSupabase({
      events,
      existingRefs: [],
      captured,
      followUps: [
        {
          id: "fu-1",
          source_answer_id: "ans-1",
          description: "Follow up on a flagged checklist answer.",
          assigned_to: "user-7",
          due_at: "2026-07-11T15:00:00.000Z",
          checklist_answers: { checklist_questions: { prompt: "Recheck cold holding" } },
        },
      ],
    });

    const result = await processTaskEvents(supabase);

    expect(result).toEqual({ created: 1, skipped: 0 });
    expect(captured[0]).toMatchObject({
      kind: "follow_up",
      title: "Follow-up: Recheck cold holding",
      assigned_user_id: "user-7",
      due_at: "2026-07-11T15:00:00.000Z",
    });
  });

  it("emits task_assigned carrying the assignee so the notify extractor resolves them (N2)", async () => {
    const events: AppEventRow[] = [
      {
        id: "evt-fu",
        event_key: "follow_up_assigned",
        payload: { sourceAnswerId: "ans-1", runId: "run-1" },
        created_at: CREATED_AT,
      },
    ];
    const captured: Array<Record<string, unknown>> = [];
    const supabase = fakeSupabase({
      events,
      existingRefs: [],
      captured,
      followUps: [
        {
          id: "fu-1",
          source_answer_id: "ans-1",
          description: "Follow up on a flagged checklist answer.",
          assigned_to: "user-7",
          due_at: "2026-07-11T15:00:00.000Z",
          checklist_answers: { checklist_questions: { prompt: "Recheck cold holding" } },
        },
      ],
    });

    await processTaskEvents(supabase);

    // Before N2 the emitted payload had no user_id, so extractRecipientIds
    // resolved [] and the assignee was never notified.
    const call = (emitEvent as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === "task_assigned",
    );
    expect(call).toBeDefined();
    const payload = call![1] as Record<string, unknown>;
    expect(payload.user_id).toBe("user-7");
    expect(extractRecipientIds(payload)).toEqual(["user-7"]);
  });

  it("emits a pool (unassigned) system task with no recipient, resolving to no one (N2)", async () => {
    const events: AppEventRow[] = [
      {
        id: "evt-reward",
        event_key: "reward_claim",
        payload: { claim_id: "claim-1", user_id: "user-9", reward_name: "Free sandwich" },
        created_at: CREATED_AT,
      },
    ];
    const captured: Array<Record<string, unknown>> = [];
    const supabase = fakeSupabase({ events, existingRefs: [], captured });

    await processTaskEvents(supabase);

    const call = (emitEvent as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === "task_assigned",
    );
    expect(call).toBeDefined();
    const payload = call![1] as Record<string, unknown>;
    // reward_fulfillment is a pool task: no assignee, so no recipient. The
    // claimant (user-9) is recorded in ref, NOT as a notification recipient.
    expect(payload.user_id).toBeUndefined();
    expect(extractRecipientIds(payload)).toEqual([]);
  });

  it("is idempotent: skips an event that already produced a task", async () => {
    const events: AppEventRow[] = [
      {
        id: "evt-1",
        event_key: "reward_claim",
        payload: { claim_id: "claim-1" },
        created_at: CREATED_AT,
      },
    ];
    const captured: Array<Record<string, unknown>> = [];
    const supabase = fakeSupabase({
      events,
      existingRefs: [{ event_id: "evt-1" }],
      captured,
    });

    const result = await processTaskEvents(supabase);

    expect(result).toEqual({ created: 0, skipped: 1 });
    expect(captured).toHaveLength(0);
  });

  it("skips events it cannot map without throwing", async () => {
    const events: AppEventRow[] = [
      {
        id: "evt-1",
        event_key: "setup_posted",
        payload: { setup_id: "setup-1" },
        created_at: CREATED_AT,
      },
    ];
    const captured: Array<Record<string, unknown>> = [];
    const supabase = fakeSupabase({ events, existingRefs: [], captured });

    const result = await processTaskEvents(supabase);

    expect(result).toEqual({ created: 0, skipped: 1 });
  });
});
