import { beforeEach, describe, expect, it, vi } from "vitest";

import { extractRecipientIds } from "@/lib/notify/recipients";

/**
 * Integration-style coverage for the Accountability server actions
 * (app/(app)/accountability/actions.ts). Fills the "no test coverage for
 * actions, queries, or cron" gap flagged in docs/KITCHENIQ-PARITY-AUDIT.md --
 * in particular, the double-submit guard bug (issueInfraction's duplicate
 * check silently running on the per-request client, which RLS blocks for a
 * Team-Leader/Shift-Supervisor-tier issuer) shipped green precisely because
 * nothing exercised issueInfraction as that tier of caller. These tests fake
 * the Supabase clients so they can assert on WHICH client
 * (per-request vs. service-role) each query actually runs against.
 */

const ISSUER_ID = "11111111-1111-4111-8111-111111111111";
const RECIPIENT_ID = "22222222-2222-4222-8222-222222222222";
const TYPE_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;
type Response = { data: unknown; error: { message: string } | null };

/**
 * Minimal fake PostgREST query builder: chain calls (select/eq/order/limit/
 * insert/update/delete) are no-ops that return the same builder, and the
 * query resolves -- via `.maybeSingle()`, `.single()`, or plain `await`
 * (`.then`) -- to the next canned response queued for that table.
 */
function createFakeClient(
  responses: Record<string, Response[]>,
  recordCalls?: (table: string) => void,
  authUserId: string | null = ISSUER_ID,
) {
  return {
    from(table: string) {
      recordCalls?.(table);
      const queue = responses[table];
      if (!queue || queue.length === 0) {
        throw new Error(`no mock response queued for table "${table}"`);
      }
      const response = queue.shift()!;
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.order = chain;
      builder.limit = chain;
      builder.insert = chain;
      builder.update = chain;
      builder.delete = chain;
      builder.maybeSingle = async () => response;
      builder.single = async () => response;
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject);
      return builder;
    },
    auth: {
      getUser: async () => ({
        data: { user: authUserId ? { id: authUserId } : null },
      }),
    },
  };
}

const requirePermissionMock = vi.fn(async (key: string) => {
  void key;
  return undefined;
});
const emitEventMock = vi.fn(async (key: string, payload: Record<string, unknown>) => {
  void key;
  void payload;
  return undefined;
});
let perRequestClient: ReturnType<typeof createFakeClient>;
let serviceRoleClient: ReturnType<typeof createFakeClient>;
const perRequestTableCalls: string[] = [];
const serviceRoleTableCalls: string[] = [];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    requirePermission: (key: Parameters<typeof actual.requirePermission>[0]) =>
      requirePermissionMock(key),
  };
});

vi.mock("@/lib/events/bus", () => ({
  emitEvent: (key: string, payload: Record<string, unknown>) => emitEventMock(key, payload),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => perRequestClient,
  createServiceRoleClient: () => serviceRoleClient,
}));

// vi.mock(...) calls above are hoisted above this import by Vitest's
// transform, so actions.ts picks up the mocked modules.
import { issueInfraction } from "./actions";

function infractionTypeRow(): Row {
  return { id: TYPE_ID, points: 5, active: true };
}

function settingsRow(): Row {
  return { period_kind: "rolling", period_days: 60 };
}

beforeEach(() => {
  requirePermissionMock.mockClear();
  requirePermissionMock.mockImplementation(async () => undefined);
  emitEventMock.mockClear();
  perRequestTableCalls.length = 0;
  serviceRoleTableCalls.length = 0;
});

describe("issueInfraction", () => {
  it("rejects self-issuance before touching the database", async () => {
    perRequestClient = createFakeClient({}, (t) => perRequestTableCalls.push(t));
    serviceRoleClient = createFakeClient({}, (t) => serviceRoleTableCalls.push(t));

    const result = await issueInfraction({
      userId: ISSUER_ID,
      typeId: TYPE_ID,
      note: "",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/yourself/i);
    }
    // Self-issuance must be rejected before any query -- neither client
    // should have been touched.
    expect(perRequestTableCalls).toEqual([]);
    expect(serviceRoleTableCalls).toEqual([]);
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it(
    "detects a double-submit for a Team-Leader-tier issuer even though the " +
      "per-request client's own SELECT on `infractions` would return nothing under RLS",
    async () => {
      const nowIso = new Date().toISOString();

      // The per-request client purposefully has NO queued response for the
      // "infractions" table's duplicate-check shape -- if issueInfraction
      // regresses to running that check on `supabase` instead of `admin`,
      // this test fails loudly (no response queued) rather than silently
      // passing on a wrong-client mistake.
      perRequestClient = createFakeClient(
        {
          infraction_types: [{ data: infractionTypeRow(), error: null }],
          accountability_settings: [{ data: settingsRow(), error: null }],
        },
        (t) => perRequestTableCalls.push(t),
      );

      serviceRoleClient = createFakeClient(
        {
          // 1st admin.infractions query: the duplicate-submit check finds a
          // just-issued row from the same issuer/user/type/note.
          infractions: [
            {
              data: [{ id: "existing-infraction-id", issued_at: nowIso, note: null }],
              error: null,
            },
            // 2nd admin.infractions query: active-points sum for the
            // threshold check (irrelevant to this test, kept minimal).
            { data: [{ points: 5, expires_at: null }], error: null },
          ],
          disciplinary_action_types: [{ data: [], error: null }],
          disciplinary_actions: [{ data: [], error: null }],
        },
        (t) => serviceRoleTableCalls.push(t),
      );

      const result = await issueInfraction({
        userId: RECIPIENT_ID,
        typeId: TYPE_ID,
        note: "",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Reused the existing row instead of inserting a second infraction.
        expect(result.data.infractionId).toBe("existing-infraction-id");
        expect(result.data.triggeredActionTypeIds).toEqual([]);
      }
      // The duplicate check ran against the service-role client's
      // "infractions" table, not the per-request one.
      expect(serviceRoleTableCalls).toContain("infractions");
      expect(perRequestTableCalls).not.toContain("infractions");
      // No new infraction_issued event for a detected duplicate.
      expect(emitEventMock).not.toHaveBeenCalledWith(
        "infraction_issued",
        expect.anything(),
      );
    },
  );

  it("issues a fresh infraction and reports newly triggered ladder thresholds", async () => {
    perRequestClient = createFakeClient(
      {
        infraction_types: [{ data: { id: TYPE_ID, points: 15, active: true }, error: null }],
        accountability_settings: [{ data: settingsRow(), error: null }],
        infractions: [
          { data: { id: "new-infraction-id" }, error: null }, // insert().select("id").single()
        ],
      },
      (t) => perRequestTableCalls.push(t),
    );

    serviceRoleClient = createFakeClient(
      {
        infractions: [
          { data: [], error: null }, // duplicate check: no prior row
          { data: [{ points: 15, expires_at: null }], error: null }, // active points = 15
        ],
        disciplinary_action_types: [
          {
            data: [
              { id: "coaching", threshold_points: 10 },
              { id: "written", threshold_points: 20 },
            ],
            error: null,
          },
        ],
        disciplinary_actions: [
          { data: [], error: null }, // no existing actions -> nothing suppressed
          { data: null, error: null }, // insert for the "coaching" rung
        ],
      },
      (t) => serviceRoleTableCalls.push(t),
    );

    const result = await issueInfraction({
      userId: RECIPIENT_ID,
      typeId: TYPE_ID,
      note: "Left the line unattended.",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.infractionId).toBe("new-infraction-id");
      expect(result.data.triggeredActionTypeIds).toEqual(["coaching"]);
    }
    expect(emitEventMock).toHaveBeenCalledWith("infraction_issued", {
      infractionId: "new-infraction-id",
      userId: RECIPIENT_ID,
    });
    expect(emitEventMock).toHaveBeenCalledWith("disciplinary_triggered", {
      userId: RECIPIENT_ID,
      typeId: "coaching",
    });
  });

  describe("canonical event payload contract", () => {
    it("emits infraction_issued/disciplinary_triggered payloads whose recipient key the real notify extractor resolves", () => {
      // Contract-level check (not a fabricated shape): exercises the same
      // extractRecipientIds() the notifications drain job actually calls,
      // against the exact payload shape issueInfraction emits above.
      expect(
        extractRecipientIds({ infractionId: "x", userId: RECIPIENT_ID }),
      ).toEqual([RECIPIENT_ID]);
      expect(
        extractRecipientIds({ userId: RECIPIENT_ID, typeId: "coaching" }),
      ).toEqual([RECIPIENT_ID]);
    });
  });
});
