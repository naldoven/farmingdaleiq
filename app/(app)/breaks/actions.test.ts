import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action coverage for /breaks (app/(app)/breaks/actions.ts), added in
 * the 2026-10 release-readiness pass (docs/BREAKS-RELEASE-READINESS.md). The
 * pure engine in lib/breaks/entitlement.ts is covered next to it; these tests
 * cover what only the action layer does: the permission gate, the
 * compare-and-swap on status transitions, and the same-date dedupe plus
 * conflict-tolerant insert in generateBreaksForSetup.
 */

const BREAK_ID = "11111111-1111-4111-8111-111111111111";
const SETUP_ID = "22222222-2222-4222-8222-222222222222";
const USER_A = "33333333-3333-4333-8333-333333333333";
const USER_B = "44444444-4444-4444-8444-444444444444";
const DAY_PART_ID = "55555555-5555-4555-8555-555555555555";

type Response = { data: unknown; error: { message: string; code?: string } | null };

interface Call {
  table: string;
  op: string | null;
  payload?: unknown;
  options?: unknown;
  filters: [string, ...unknown[]][];
}

/**
 * Minimal fake PostgREST builder (same shape as the accountability action
 * tests): chain methods return the builder, the query resolves to the next
 * canned response for that table, and every call is recorded so a test can
 * assert on the filters a write carried (the compare-and-swap `.eq("status")`).
 */
function createFakeClient(responses: Record<string, Response[]>, calls: Call[]) {
  return {
    from(table: string) {
      const queue = responses[table];
      if (!queue || queue.length === 0) {
        throw new Error(`no mock response queued for table "${table}"`);
      }
      const response = queue.shift()!;
      const call: Call = { table, op: null, filters: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      const filter = (name: string) => (...args: unknown[]) => {
        call.filters.push([name, ...args]);
        return builder;
      };
      builder.select = chain;
      builder.order = chain;
      builder.limit = chain;
      builder.eq = filter("eq");
      builder.in = filter("in");
      builder.is = filter("is");
      builder.not = filter("not");
      builder.insert = (payload: unknown) => {
        call.op = "insert";
        call.payload = payload;
        return builder;
      };
      builder.upsert = (payload: unknown, options: unknown) => {
        call.op = "upsert";
        call.payload = payload;
        call.options = options;
        return builder;
      };
      builder.update = (payload: unknown) => {
        call.op = "update";
        call.payload = payload;
        return builder;
      };
      builder.maybeSingle = async () => response;
      builder.single = async () => response;
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject);
      return builder;
    },
  };
}

const requirePermissionMock = vi.fn(async (key: string) => {
  void key;
  return undefined;
});
let perRequestClient: ReturnType<typeof createFakeClient>;
let serviceRoleClient: ReturnType<typeof createFakeClient>;
let perRequestCalls: Call[];
let serviceRoleCalls: Call[];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    requirePermission: (key: Parameters<typeof actual.requirePermission>[0]) =>
      requirePermissionMock(key),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => perRequestClient,
  createServiceRoleClient: () => serviceRoleClient,
}));

import { authorizeBreak, completeBreak, generateBreaksForSetup, startBreak } from "./actions";

function ok(data: unknown): Response {
  return { data, error: null };
}

beforeEach(() => {
  requirePermissionMock.mockClear();
  requirePermissionMock.mockImplementation(async () => undefined);
  perRequestCalls = [];
  serviceRoleCalls = [];
  serviceRoleClient = createFakeClient({}, serviceRoleCalls);
});

describe("break transitions", () => {
  it("requires breaks.manage before touching the database", async () => {
    requirePermissionMock.mockImplementation(async () => {
      throw new Error("Missing permission: breaks.manage");
    });
    perRequestClient = createFakeClient({}, perRequestCalls);

    const result = await authorizeBreak({ id: BREAK_ID });

    expect(result.ok).toBe(false);
    expect(requirePermissionMock).toHaveBeenCalledWith("breaks.manage");
    expect(perRequestCalls).toHaveLength(0);
  });

  it("writes with a compare-and-swap on the status it validated against", async () => {
    perRequestClient = createFakeClient(
      {
        breaks: [ok({ id: BREAK_ID, status: "pending" }), ok([{ id: BREAK_ID }])],
      },
      perRequestCalls,
    );

    const result = await authorizeBreak({ id: BREAK_ID });

    expect(result).toEqual({ ok: true, data: undefined });
    const write = perRequestCalls[1];
    expect(write.op).toBe("update");
    expect(write.payload).toMatchObject({ status: "authorized" });
    expect((write.payload as { authorized_at?: string }).authorized_at).toBeTruthy();
    expect(write.filters).toEqual(
      expect.arrayContaining([
        ["eq", "id", BREAK_ID],
        ["eq", "status", "pending"],
      ]),
    );
  });

  it("treats a lost race that landed the same state as a successful no-op", async () => {
    // Read says authorized; the update matches zero rows because another
    // leader already moved it; the re-read shows it is now active anyway.
    perRequestClient = createFakeClient(
      {
        breaks: [ok({ id: BREAK_ID, status: "authorized" }), ok([]), ok({ status: "active" })],
      },
      perRequestCalls,
    );

    const result = await startBreak({ id: BREAK_ID });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(perRequestCalls.filter((c) => c.op === "update")).toHaveLength(1);
  });

  it("reports a lost race that landed a different state instead of overwriting it", async () => {
    perRequestClient = createFakeClient(
      {
        breaks: [ok({ id: BREAK_ID, status: "active" }), ok([]), ok({ status: "missed" })],
      },
      perRequestCalls,
    );

    const result = await completeBreak({ id: BREAK_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("missed");
  });

  it("is a no-op when the break is already in the target state (double tap)", async () => {
    perRequestClient = createFakeClient(
      { breaks: [ok({ id: BREAK_ID, status: "authorized" })] },
      perRequestCalls,
    );

    const result = await authorizeBreak({ id: BREAK_ID });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(perRequestCalls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("rejects an illegal jump (pending -> completed)", async () => {
    perRequestClient = createFakeClient(
      { breaks: [ok({ id: BREAK_ID, status: "pending" })] },
      perRequestCalls,
    );

    const result = await completeBreak({ id: BREAK_ID });

    expect(result.ok).toBe(false);
    expect(perRequestCalls.filter((c) => c.op === "update")).toHaveLength(0);
  });
});

describe("generateBreaksForSetup", () => {
  // Lunch day-part (11:00-15:00 New York) on a July date, matching the seed.
  const setupRow = { id: SETUP_ID, date: "2026-07-07", day_part_id: DAY_PART_ID };
  const lunch = { start_time: "11:00:00", end_time: "15:00:00" };
  const adultRule = {
    id: "rule-adult",
    min_shift_minutes: 360,
    max_shift_minutes: 1440,
    age_band: "adult",
    rest_minutes_paid: 0,
    meal_minutes_unpaid: 30,
    sort: 1,
  };

  it("plans a break from the scheduled shift, skips people already covered that date, and upserts", async () => {
    perRequestClient = createFakeClient(
      {
        setups: [ok(setupRow), ok([{ id: SETUP_ID }, { id: "other-setup-same-day" }])],
        day_parts: [ok(lunch)],
        setup_assignments: [
          ok([
            // Arrives 10:00, scheduled until 18:00: an 8-hour shift, so the
            // 6-hour adult rule applies even though Lunch itself is 4 hours.
            {
              user_id: USER_A,
              arrival_time: "2026-07-07T14:00:00.000Z",
              scheduled_end: "2026-07-07T22:00:00.000Z",
            },
            // Same shift shape, but already has a meal break planned on the
            // other setup for this date, so no second entitlement.
            {
              user_id: USER_B,
              arrival_time: "2026-07-07T14:00:00.000Z",
              scheduled_end: "2026-07-07T22:00:00.000Z",
            },
          ]),
        ],
        break_rules: [ok([adultRule])],
        breaks: [ok([{ user_id: USER_B, kind: "meal" }]), ok(null)],
      },
      perRequestCalls,
    );
    serviceRoleClient = createFakeClient(
      { profiles_private: [ok([{ profile_id: USER_A, birthdate: "1990-01-01" }])] },
      serviceRoleCalls,
    );

    const result = await generateBreaksForSetup(SETUP_ID);

    expect(result).toEqual({ ok: true, data: { inserted: 1 } });
    const existingRead = perRequestCalls.find((c) => c.table === "breaks" && c.op === null);
    expect(existingRead?.filters).toEqual([["in", "setup_id", [SETUP_ID, "other-setup-same-day"]]]);
    const write = perRequestCalls.find((c) => c.table === "breaks" && c.op === "upsert");
    expect(write?.options).toEqual({ onConflict: "setup_id,user_id,kind", ignoreDuplicates: true });
    expect(write?.payload).toEqual([
      {
        setup_id: SETUP_ID,
        user_id: USER_A,
        rule_id: "rule-adult",
        kind: "meal",
        sequence: 1,
        status: "pending",
      },
    ]);
    // Birthdate is read past RLS with the service-role client, and nothing else is.
    expect(serviceRoleCalls.map((c) => c.table)).toEqual(["profiles_private"]);
  });

  it("plans nothing when no scheduled end is recorded and the day-part is under the rule", async () => {
    perRequestClient = createFakeClient(
      {
        setups: [ok(setupRow), ok([{ id: SETUP_ID }])],
        day_parts: [ok(lunch)],
        setup_assignments: [
          ok([{ user_id: USER_A, arrival_time: "2026-07-07T15:00:00.000Z", scheduled_end: null }]),
        ],
        break_rules: [ok([adultRule])],
        breaks: [ok([])],
      },
      perRequestCalls,
    );
    serviceRoleClient = createFakeClient({ profiles_private: [ok([])] }, serviceRoleCalls);

    const result = await generateBreaksForSetup(SETUP_ID);

    expect(result).toEqual({ ok: true, data: { inserted: 0 } });
    expect(perRequestCalls.filter((c) => c.table === "breaks" && c.op === "upsert")).toHaveLength(0);
  });
});
