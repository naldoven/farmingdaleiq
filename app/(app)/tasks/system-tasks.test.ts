import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/events/bus", () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}));

import { emitEvent } from "@/lib/events/bus";
import type { Database } from "@/lib/db/types";
import {
  mapEventToTaskInsert,
  processTaskEvents,
  type AppEventRow,
} from "./system-tasks";

const CREATED_AT = "2026-07-10T12:00:00.000Z";

describe("mapEventToTaskInsert", () => {
  it("maps a reward_claim event to a reward_fulfillment task", () => {
    const event: AppEventRow = {
      id: "evt-1",
      event_key: "reward_claim",
      payload: { reward_claim_id: "claim-1", reward_name: "Free sandwich", user_name: "Alex" },
      created_at: CREATED_AT,
    };
    const insert = mapEventToTaskInsert(event);
    expect(insert).toMatchObject({
      kind: "reward_fulfillment",
      title: "Fulfill reward: Free sandwich",
      description: "Claimed by Alex.",
      date: "2026-07-10",
      ref: { event_id: "evt-1", source: "reward_claim", reward_claim_id: "claim-1" },
    });
  });

  it("skips a reward_claim event missing reward_claim_id", () => {
    const event: AppEventRow = {
      id: "evt-2",
      event_key: "reward_claim",
      payload: { reward_name: "Free sandwich" },
      created_at: CREATED_AT,
    };
    expect(mapEventToTaskInsert(event)).toBeNull();
  });

  it("maps a follow_up_assigned event to a follow_up task assigned to a user", () => {
    const event: AppEventRow = {
      id: "evt-3",
      event_key: "follow_up_assigned",
      payload: {
        title: "Recheck cold holding",
        assigned_user_id: "user-1",
        assigned_position_id: "position-1",
      },
      created_at: CREATED_AT,
    };
    const insert = mapEventToTaskInsert(event);
    expect(insert).toMatchObject({
      kind: "follow_up",
      title: "Recheck cold holding",
      assigned_user_id: "user-1",
      assigned_position_id: null,
    });
  });

  it("falls back to a default title for follow_up_assigned with no title", () => {
    const event: AppEventRow = {
      id: "evt-4",
      event_key: "follow_up_assigned",
      payload: {},
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

// Minimal fake Supabase covering exactly the chains processTaskEvents uses.
function fakeSupabase(opts: {
  events: AppEventRow[];
  existingRefs: Array<Record<string, unknown> | null>;
  captured: Array<Record<string, unknown>>;
}) {
  const { events, existingRefs, captured } = opts;
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
                    const created = { id, kind: row.kind, ref: row.ref };
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

describe("processTaskEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a task for a new event and emits task_assigned", async () => {
    const events: AppEventRow[] = [
      {
        id: "evt-1",
        event_key: "reward_claim",
        payload: { reward_claim_id: "claim-1", reward_name: "Free sandwich" },
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

  it("is idempotent: skips an event that already produced a task", async () => {
    const events: AppEventRow[] = [
      {
        id: "evt-1",
        event_key: "reward_claim",
        payload: { reward_claim_id: "claim-1" },
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
