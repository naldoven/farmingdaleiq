import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Station Grid action coverage for audit iter 1:
 *   TR3 -- graduating the last station finalizes via the atomic
 *          graduate_trainee RPC (status flip + audit in one transaction), and
 *          only emits graduation_ready on a FRESH graduation, never on a
 *          recovery/no-op run.
 *   TR4 -- cycling a station OUT of 'scored' (the score-5 -> not_started wrap)
 *          clears that position's current rating so the grid and /ratings agree.
 * These fake the Supabase client to drive the real cycleStationProgress action.
 */

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const ENROLLMENT_ID = "22222222-2222-4222-8222-222222222222";
const STATION_ID = "33333333-3333-4333-8333-333333333333";
const ROADMAP_ID = "44444444-4444-4444-8444-444444444444";
const POSITION_ID = "55555555-5555-4555-8555-555555555555";
const USER_ID = "66666666-6666-4666-8666-666666666666";

type Response = { data: unknown; error: { message: string; code?: string } | null };

function createFakeClient(
  responses: Record<string, Response[]>,
  rpcResult: Response = { data: [{ graduated: true, audit_created: true }], error: null },
) {
  const calls: string[] = [];
  const rpcCalls: { name: string; args: unknown }[] = [];
  return {
    calls,
    rpcCalls,
    from(table: string) {
      calls.push(table);
      const queue = responses[table];
      if (!queue || queue.length === 0) {
        throw new Error(`no mock response queued for table "${table}"`);
      }
      const response = queue.shift()!;
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const m of ["select", "eq", "neq", "in", "is", "order", "limit", "insert", "update", "delete"]) {
        builder[m] = chain;
      }
      builder.maybeSingle = async () => response;
      builder.single = async () => response;
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject);
      return builder;
    },
    rpc(name: string, args: unknown) {
      rpcCalls.push({ name, args });
      return Promise.resolve(rpcResult);
    },
    auth: {
      getUser: async () => ({ data: { user: { id: ACTOR_ID } } }),
    },
  };
}

let client: ReturnType<typeof createFakeClient>;
const emitEventMock = vi.fn(async (key: string, payload?: Record<string, unknown>) => {
  void key;
  void payload;
  return undefined;
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    requirePermission: vi.fn(async () => undefined),
    hasPermission: vi.fn(async () => true),
  };
});

vi.mock("@/lib/events/bus", () => ({
  emitEvent: (key: string, payload: Record<string, unknown>) => emitEventMock(key, payload),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => client,
}));

import { cycleStationProgress } from "./actions";

beforeEach(() => {
  emitEventMock.mockClear();
});

// Full response set for a last-station score that completes the roadmap.
function graduationResponses(): Record<string, Response[]> {
  return {
    station_progress: [
      // current cell: in_training -> scored(1)
      { data: { id: "sp-1", status: "in_training", score: null, enrollment_id: ENROLLMENT_ID, roadmap_station_id: STATION_ID }, error: null },
      { data: null, error: null }, // update the cell to scored
      { data: [{ status: "scored" }], error: null }, // progress list for the completeness check
    ],
    roadmap_stations: [
      { data: { position_id: POSITION_ID, roadmap_id: ROADMAP_ID }, error: null }, // scored-station lookup
      { data: [{ id: STATION_ID }], error: null }, // all stations on the roadmap
    ],
    trainee_enrollments: [
      { data: { id: ENROLLMENT_ID, user_id: USER_ID, roadmap_id: ROADMAP_ID, status: "active" }, error: null },
    ],
    position_ratings: [
      { data: null, error: null }, // replaceCurrentRating: clear old is_current
      { data: { stars: 1, comment: null }, error: null }, // replaceCurrentRating: insert new current (.select().single())
    ],
    rerate_prompts: [{ data: null, error: null }], // replaceCurrentRating: resolve nudge
    passports: [{ data: null, error: null }], // no position passport -> skip item progress
  };
}

describe("cycleStationProgress graduation (TR3)", () => {
  it("finalizes graduation through the atomic graduate_trainee RPC and emits on a fresh grad", async () => {
    client = createFakeClient(graduationResponses(), { data: [{ graduated: true, audit_created: true }], error: null });

    const result = await cycleStationProgress({ enrollmentId: ENROLLMENT_ID, roadmapStationId: STATION_ID });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("scored");
      expect(result.data.score).toBe(1);
    }
    // Graduation goes through the RPC, not a direct enrollment update + audit insert.
    expect(client.rpcCalls).toEqual([{ name: "graduate_trainee", args: { p_enrollment_id: ENROLLMENT_ID } }]);
    // The audit is written INSIDE the transaction, never as a separate client write.
    expect(client.calls).not.toContain("graduation_audits");
    // Fresh graduation -> notify.
    expect(emitEventMock).toHaveBeenCalledWith("graduation_ready", expect.objectContaining({ enrollmentId: ENROLLMENT_ID }));
  });

  it("does NOT re-emit graduation_ready on a recovery run (already graduated, audit re-created)", async () => {
    client = createFakeClient(graduationResponses(), { data: [{ graduated: false, audit_created: true }], error: null });

    const result = await cycleStationProgress({ enrollmentId: ENROLLMENT_ID, roadmapStationId: STATION_ID });

    expect(result.ok).toBe(true);
    // Recovery still runs the RPC...
    expect(client.rpcCalls).toEqual([{ name: "graduate_trainee", args: { p_enrollment_id: ENROLLMENT_ID } }]);
    // ...but must not fire the event a second time.
    expect(emitEventMock).not.toHaveBeenCalled();
  });
});

describe("cycleStationProgress rating on cycle-back (TR4)", () => {
  it("clears the station's current position rating when wrapping score 5 -> not_started", async () => {
    client = createFakeClient({
      station_progress: [
        // current cell: scored(5) -> not_started (the wrap)
        { data: { id: "sp-1", status: "scored", score: 5, enrollment_id: ENROLLMENT_ID, roadmap_station_id: STATION_ID }, error: null },
        { data: null, error: null }, // update the cell to not_started
      ],
      roadmap_stations: [{ data: { position_id: POSITION_ID }, error: null }],
      trainee_enrollments: [{ data: { user_id: USER_ID }, error: null }],
      position_ratings: [{ data: null, error: null }], // clear is_current
    });

    const result = await cycleStationProgress({ enrollmentId: ENROLLMENT_ID, roadmapStationId: STATION_ID });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("not_started");
      expect(result.data.score).toBeNull();
    }
    // The stale rating was cleared...
    expect(client.calls).toContain("position_ratings");
    // ...and cycling OUT of scored never graduates or re-rates.
    expect(client.rpcCalls).toHaveLength(0);
    expect(emitEventMock).not.toHaveBeenCalled();
  });
});
