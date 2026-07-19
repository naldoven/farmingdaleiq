import { beforeEach, describe, expect, it, vi } from "vitest";

import { extractRecipientIds } from "@/lib/notify/recipients";

/**
 * Producer-side coverage for the Maintenance server actions
 * (app/(app)/maintenance/actions.ts), focused on the N4 requester-notification
 * contract: the events these actions emit must carry the recipient key the
 * notifications drain (lib/notify/events.ts -> extractRecipientIds) actually
 * reads, or the requester is never notified no matter how correct the drain is.
 *
 * This is the FAITHFUL reproduction of the confirmed N4 bug. The pre-existing
 * drain test (lib/notify/events.test.ts, "notifies the requester on a
 * work_order_status event carrying user_id") fed the drain a hand-built payload
 * WITH a user_id that the real producer never emits, so it stayed green while
 * production shipped `work_order_status` payloads of shape {workOrderId, status}
 * — no recipient at all — that could never create a notification. These tests
 * assert on the payload the producer ACTUALLY emits, using the same fake-client
 * pattern as app/(app)/accountability/actions.test.ts so they fail loudly on a
 * wrong-shape emit rather than passing on a fabricated one.
 */

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const REQUESTER_ID = "22222222-2222-4222-8222-222222222222";
const WORK_ORDER_ID = "33333333-3333-4333-8333-333333333333";
const REQUEST_ID = "44444444-4444-4444-8444-444444444444";

type Response = { data: unknown; error: { message: string; code?: string } | null };

/**
 * Minimal fake PostgREST query builder: chained calls
 * (select/eq/neq/order/limit/insert/update/delete) are no-ops returning the
 * same builder, and the query resolves — via `.maybeSingle()`, `.single()`, or
 * plain `await` (`.then`) — to the next canned response queued for that table.
 * One response is consumed per `.from(table)` call, so the queue order must
 * match the action's real query sequence.
 */
function createFakeClient(
  responses: Record<string, Response[]>,
  recordCalls?: (table: string) => void,
  authUserId: string | null = ACTOR_ID,
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
      builder.neq = chain;
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
      getUser: async () => ({ data: { user: authUserId ? { id: authUserId } : null } }),
    },
  };
}

const requirePermissionMock = vi.fn(async (key: string) => {
  void key;
  return undefined;
});
const hasPermissionMock = vi.fn(async (key: string) => {
  void key;
  return true;
});
const emitEventMock = vi.fn(async (key: string, payload: Record<string, unknown>) => {
  void key;
  void payload;
  return undefined;
});
let perRequestClient: ReturnType<typeof createFakeClient>;
const tableCalls: string[] = [];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    requirePermission: (key: Parameters<typeof actual.requirePermission>[0]) =>
      requirePermissionMock(key),
    hasPermission: (key: Parameters<typeof actual.hasPermission>[0]) => hasPermissionMock(key),
  };
});

vi.mock("@/lib/events/bus", () => ({
  emitEvent: (key: string, payload: Record<string, unknown>) => emitEventMock(key, payload),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => perRequestClient,
  createServiceRoleClient: () => perRequestClient,
}));

// vi.mock(...) calls above are hoisted above this import by Vitest's transform.
import {
  approveRequest,
  completeWorkOrder,
  updateWorkOrderStatus,
} from "./actions";

beforeEach(() => {
  requirePermissionMock.mockClear();
  requirePermissionMock.mockImplementation(async () => undefined);
  hasPermissionMock.mockClear();
  hasPermissionMock.mockImplementation(async () => true);
  emitEventMock.mockClear();
  tableCalls.length = 0;
});

describe("work_order_status requester notification (N4)", () => {
  it("updateWorkOrderStatus emits work_order_status carrying the requester's user_id", async () => {
    perRequestClient = createFakeClient(
      {
        work_orders: [
          // fetch
          {
            data: {
              id: WORK_ORDER_ID,
              status: "open",
              assigned_user_id: null,
              notify_discord: false,
              discord_channel_id: null,
              request_id: REQUEST_ID,
            },
            error: null,
          },
          // compare-and-swap update
          { data: { id: WORK_ORDER_ID }, error: null },
        ],
        // requester resolution (maintenance_requests.submitted_by)
        maintenance_requests: [{ data: { submitted_by: REQUESTER_ID }, error: null }],
      },
      (t) => tableCalls.push(t),
    );

    const result = await updateWorkOrderStatus({ workOrderId: WORK_ORDER_ID, status: "in_progress" });

    expect(result.ok).toBe(true);
    // The event the drain sees MUST carry the requester as the canonical
    // recipient, or no in-app/push notification is ever created.
    expect(emitEventMock).toHaveBeenCalledWith("work_order_status", {
      workOrderId: WORK_ORDER_ID,
      status: "in_progress",
      user_id: REQUESTER_ID,
    });
  });

  it("completeWorkOrder emits work_order_status carrying the requester's user_id", async () => {
    perRequestClient = createFakeClient(
      {
        work_orders: [
          {
            data: {
              id: WORK_ORDER_ID,
              status: "in_progress",
              assigned_user_id: null,
              equipment_id: null,
              notify_discord: false,
              discord_channel_id: null,
              request_id: REQUEST_ID,
            },
            error: null,
          },
          { data: { id: WORK_ORDER_ID }, error: null },
        ],
        maintenance_requests: [{ data: { submitted_by: REQUESTER_ID }, error: null }],
      },
      (t) => tableCalls.push(t),
    );

    const result = await completeWorkOrder({ workOrderId: WORK_ORDER_ID });

    expect(result.ok).toBe(true);
    expect(emitEventMock).toHaveBeenCalledWith("work_order_status", {
      workOrderId: WORK_ORDER_ID,
      status: "complete",
      user_id: REQUESTER_ID,
    });
  });

  it("omits the recipient for a directly-created work order that has no originating request", async () => {
    perRequestClient = createFakeClient(
      {
        work_orders: [
          {
            data: {
              id: WORK_ORDER_ID,
              status: "open",
              assigned_user_id: null,
              notify_discord: false,
              discord_channel_id: null,
              request_id: null,
            },
            error: null,
          },
          { data: { id: WORK_ORDER_ID }, error: null },
        ],
      },
      (t) => tableCalls.push(t),
    );

    const result = await updateWorkOrderStatus({ workOrderId: WORK_ORDER_ID, status: "in_progress" });

    expect(result.ok).toBe(true);
    // No requester exists, so no recipient key — and crucially, no
    // maintenance_requests lookup is attempted (the fake would throw if it were,
    // since none is queued).
    expect(emitEventMock).toHaveBeenCalledWith("work_order_status", {
      workOrderId: WORK_ORDER_ID,
      status: "in_progress",
    });
    expect(tableCalls).not.toContain("maintenance_requests");
  });
});

describe("maint_request requester notification (N4 regression lock)", () => {
  it("approveRequest emits maint_request carrying the requester's user_id, and does not duplicate it onto the work_order_status open event", async () => {
    perRequestClient = createFakeClient(
      {
        maintenance_requests: [
          // fetch request
          {
            data: {
              id: REQUEST_ID,
              title: "Fix the fryer",
              description: null,
              equipment_id: null,
              status: "pending",
              work_order_id: null,
              submitted_by: REQUESTER_ID,
            },
            error: null,
          },
          // compare-and-swap claim
          { data: { id: REQUEST_ID }, error: null },
          // link work_order_id back onto the request
          { data: null, error: null },
        ],
        work_orders: [
          // insert new work order
          { data: { id: WORK_ORDER_ID }, error: null },
        ],
      },
      (t) => tableCalls.push(t),
    );

    const result = await approveRequest({
      requestId: REQUEST_ID,
      priority: "medium",
      assignedUserId: undefined,
      vendorId: undefined,
      scheduledFor: undefined,
      dueAt: undefined,
    });

    expect(result.ok).toBe(true);
    // maint_request(approved) is the requester-facing notification for triage.
    expect(emitEventMock).toHaveBeenCalledWith("maint_request", {
      requestId: REQUEST_ID,
      status: "approved",
      workOrderId: WORK_ORDER_ID,
      user_id: REQUESTER_ID,
    });
    // The work_order_status(open) fired in the same instant deliberately carries
    // NO requester: the requester already got maint_request(approved), so
    // duplicating a second notification at the same moment would just be noise.
    expect(emitEventMock).toHaveBeenCalledWith("work_order_status", {
      workOrderId: WORK_ORDER_ID,
      status: "open",
    });
  });
});

describe("canonical event payload contract", () => {
  it("the emitted work_order_status recipient key resolves via the real notify extractor", () => {
    // The fixed shape resolves the requester...
    expect(
      extractRecipientIds({ workOrderId: WORK_ORDER_ID, status: "complete", user_id: REQUESTER_ID }),
    ).toEqual([REQUESTER_ID]);
    // ...whereas the old producer shape (no recipient) resolves no one, which is
    // exactly why zero work_order_status notifications ever reached a requester.
    expect(extractRecipientIds({ workOrderId: WORK_ORDER_ID, status: "complete" })).toEqual([]);
  });
});
