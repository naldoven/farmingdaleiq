import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PermissionError } from "@/lib/auth/permissions";
import { PACKING_LIST_NOT_BUILT_ERROR, planPreOrderRows } from "@/app/(app)/catering/logic";

/**
 * Server-action coverage for Catering (app/(app)/catering/actions.ts):
 * the stage handoff guards on changeStage, the manager overrides
 * (moveOrderBack, restoreOrder), and the manual packing-list build. Uses the
 * same queued fake-client pattern as app/(app)/maintenance/actions.test.ts,
 * plus a record of every chained call so a test can assert the
 * compare-and-set filter and the written values, not only the result.
 */

const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";

type Response = { data: unknown; error: { message: string; code?: string } | null };
type Op = [method: string, args: unknown[]];
interface Call {
  table: string;
  ops: Op[];
}

const CHAIN_METHODS = [
  "select",
  "eq",
  "neq",
  "is",
  "not",
  "in",
  "ilike",
  "order",
  "limit",
  "insert",
  "update",
  "delete",
] as const;

/**
 * One canned response is consumed per `.from(table)` call, so each queue must
 * follow the action's real query order. A table with nothing queued throws,
 * which is how a test proves a query was never made. `.rpc(name, args)` works
 * the same way with a queue keyed "rpc:<name>", and records one call whose
 * single op is ["rpc", [args]].
 */
function createFakeClient(responses: Record<string, Response[]>) {
  const calls: Call[] = [];
  return {
    calls,
    async rpc(name: string, args: unknown) {
      const key = `rpc:${name}`;
      const queue = responses[key];
      if (!queue || queue.length === 0) {
        throw new Error(`no mock response queued for "${key}"`);
      }
      calls.push({ table: key, ops: [["rpc", [args]]] });
      return queue.shift()!;
    },
    from(table: string) {
      const queue = responses[table];
      if (!queue || queue.length === 0) {
        throw new Error(`no mock response queued for table "${table}"`);
      }
      const response = queue.shift()!;
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const method of CHAIN_METHODS) {
        builder[method] = (...args: unknown[]) => {
          call.ops.push([method, args]);
          return builder;
        };
      }
      builder.maybeSingle = async () => response;
      builder.single = async () => response;
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject);
      return builder;
    },
    auth: {
      getUser: async () => ({ data: { user: { id: ACTOR_ID } } }),
    },
  };
}

/** The args of the first `method` op across this table's calls, or undefined. */
function opArgs(client: ReturnType<typeof createFakeClient>, table: string, method: string) {
  for (const call of client.calls.filter((c) => c.table === table)) {
    const op = call.ops.find(([name]) => name === method);
    if (op) return op[1];
  }
  return undefined;
}

/** Every `.eq` filter on the call that carried `method` (for example the CAS update). */
function filtersOn(client: ReturnType<typeof createFakeClient>, table: string, method: string) {
  const call = client.calls.find((c) => c.table === table && c.ops.some(([name]) => name === method));
  return (call?.ops ?? []).filter(([name]) => name === "eq").map(([, args]) => args);
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
let client: ReturnType<typeof createFakeClient>;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    requirePermission: (key: Parameters<typeof actual.requirePermission>[0]) => requirePermissionMock(key),
    hasPermission: async () => true,
  };
});

vi.mock("@/lib/events/bus", () => ({
  emitEvent: (key: string, payload: Record<string, unknown>) => emitEventMock(key, payload),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => client,
  createServiceRoleClient: () => client,
}));

// vi.mock(...) calls above are hoisted above this import by Vitest's transform.
import { changeStage, moveOrderBack, reorderChecklistDefaults, rescaleOrderSetup, restoreOrder, searchCateringOrders } from "./actions";

function order(fields: Record<string, unknown>): Response {
  return {
    data: {
      id: ORDER_ID,
      contact_id: null,
      guest_name: "Catering Guest",
      event_date: "2099-06-01",
      event_time: null,
      setup_generated_at: null,
      ...fields,
    },
    error: null,
  };
}

const landed: Response = { data: { id: ORDER_ID }, error: null };
/** A packing list stamped long before "now", so the build has surely finished. */
const BUILT_LONG_AGO = "2026-01-01T12:00:00.000Z";
const none: Response = { data: null, error: null };

function denyKey(denied: string) {
  requirePermissionMock.mockImplementation(async (key: string) => {
    if (key === denied) throw new PermissionError(denied as ConstructorParameters<typeof PermissionError>[0]);
  });
}

beforeEach(() => {
  requirePermissionMock.mockReset();
  requirePermissionMock.mockImplementation(async () => undefined);
  emitEventMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("changeStage handoff guards", () => {
  it("refuses to leave FOH Setup before the packing list is built", async () => {
    client = createFakeClient({
      catering_orders: [order({ stage: "setup", setup_generated_at: null })],
    });

    const result = await changeStage({ orderId: ORDER_ID, toStage: "out" });

    expect(result).toEqual({ ok: false, error: PACKING_LIST_NOT_BUILT_ERROR });
    expect(client.calls).toHaveLength(1);
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it("does not make a list stamped moments ago wait: the stamp and its rows commit together", async () => {
    // Builds used to stamp before inserting, so a fresh stamp could sit
    // beside an empty list and the gate waited two minutes. The build is one
    // database transaction now, so the packing items are checked right away.
    const justNow = new Date(Date.now() - 5 * 1000).toISOString();
    client = createFakeClient({
      catering_orders: [order({ stage: "setup", setup_generated_at: justNow }), landed],
      catering_checklist_items: [none],
    });

    const result = await changeStage({ orderId: ORDER_ID, toStage: "out" });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(filtersOn(client, "catering_checklist_items", "select")).toContainEqual(["stage", "setup"]);
    expect(opArgs(client, "catering_orders", "update")?.[0]).toMatchObject({ stage: "out" });
  });

  it("refuses to leave FOH Setup while a packing item is undone", async () => {
    client = createFakeClient({
      catering_orders: [order({ stage: "setup", setup_generated_at: BUILT_LONG_AGO })],
      catering_checklist_items: [{ data: { id: "undone-item" }, error: null }],
    });

    const result = await changeStage({ orderId: ORDER_ID, toStage: "out" });

    expect(result).toEqual({ ok: false, error: "Complete every FOH Setup item before moving on." });
    expect(filtersOn(client, "catering_checklist_items", "select")).toEqual(
      expect.arrayContaining([
        ["stage", "setup"],
        ["done", false],
      ]),
    );
    expect(opArgs(client, "catering_orders", "update")).toBeUndefined();
  });

  it("moves to Pickup/Delivery once the list is built and every item is done", async () => {
    client = createFakeClient({
      catering_orders: [order({ stage: "setup", setup_generated_at: BUILT_LONG_AGO }), landed],
      catering_checklist_items: [none],
    });

    const result = await changeStage({ orderId: ORDER_ID, toStage: "out" });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(opArgs(client, "catering_orders", "update")?.[0]).toMatchObject({ stage: "out" });
    expect(filtersOn(client, "catering_orders", "update")).toContainEqual(["stage", "setup"]);
    expect(emitEventMock).toHaveBeenCalledWith(
      "catering_stage_change",
      expect.objectContaining({ orderId: ORDER_ID, fromStage: "setup", toStage: "out" }),
    );
  });

  it("refuses to leave Confirmation Call while a call item is undone", async () => {
    client = createFakeClient({
      catering_orders: [order({ stage: "confirm" })],
      catering_checklist_items: [{ data: { id: "call-item" }, error: null }],
    });

    const result = await changeStage({ orderId: ORDER_ID, toStage: "setup" });

    expect(result).toEqual({ ok: false, error: "Complete every Confirmation Call item before moving on." });
    expect(filtersOn(client, "catering_checklist_items", "select")).toContainEqual(["stage", "confirm"]);
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it("treats a move to the stage the order is already on as a no-op", async () => {
    client = createFakeClient({ catering_orders: [order({ stage: "confirm" })] });

    const result = await changeStage({ orderId: ORDER_ID, toStage: "confirm" });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(client.calls).toHaveLength(1);
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it("refuses to move a closed or cancelled order", async () => {
    client = createFakeClient({ catering_orders: [order({ stage: "closed" })] });
    expect(await changeStage({ orderId: ORDER_ID, toStage: "followup" })).toEqual({
      ok: false,
      error: "This order is closed and cannot move forward.",
    });

    client = createFakeClient({ catering_orders: [order({ stage: "cancelled" })] });
    expect(await changeStage({ orderId: ORDER_ID, toStage: "confirm" })).toEqual({
      ok: false,
      error: "Cancelled orders cannot return to the active pipeline.",
    });
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it("queues one re-book call on the first close", async () => {
    client = createFakeClient({
      catering_orders: [order({ stage: "followup" }), landed],
      catering_followups: [none, none],
    });

    expect((await changeStage({ orderId: ORDER_ID, toStage: "closed" })).ok).toBe(true);
    expect(opArgs(client, "catering_followups", "insert")?.[0]).toMatchObject({ order_id: ORDER_ID });
  });

  it("does not queue a second call when re-closing an order whose call was already made", async () => {
    client = createFakeClient({
      catering_orders: [order({ stage: "followup" }), landed],
      // A resolved follow-up from the first close. Only the lookup is queued,
      // so an insert attempt would throw.
      catering_followups: [{ data: { id: "resolved-followup" }, error: null }],
    });

    expect((await changeStage({ orderId: ORDER_ID, toStage: "closed" })).ok).toBe(true);
    expect(opArgs(client, "catering_followups", "is")).toBeUndefined();
    expect(opArgs(client, "catering_followups", "insert")).toBeUndefined();
  });

  it("still needs catering.manage", async () => {
    denyKey("catering.manage");
    client = createFakeClient({});

    expect(await changeStage({ orderId: ORDER_ID, toStage: "confirm" })).toEqual({
      ok: false,
      error: "You don't have permission to do this.",
    });
  });
});

describe("moveOrderBack (manager override)", () => {
  const reason = "Guest changed the menu";

  it("is refused without catering.override, before touching the database", async () => {
    denyKey("catering.override");
    client = createFakeClient({});

    const result = await moveOrderBack({ orderId: ORDER_ID, fromStage: "setup", reason });

    expect(result).toEqual({ ok: false, error: "You don't have permission to do this." });
    expect(requirePermissionMock).toHaveBeenCalledWith("catering.override");
    expect(client.calls).toHaveLength(0);
  });

  it("is refused for an override holder without catering.manage, before touching the database", async () => {
    denyKey("catering.manage");
    client = createFakeClient({});

    const result = await moveOrderBack({ orderId: ORDER_ID, fromStage: "setup", reason });

    expect(result).toEqual({ ok: false, error: "You don't have permission to do this." });
    expect(requirePermissionMock.mock.calls.map(([key]) => key)).toEqual(["catering.override", "catering.manage"]);
    expect(client.calls).toHaveLength(0);
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it("is refused without a reason", async () => {
    client = createFakeClient({});

    const result = await moveOrderBack({ orderId: ORDER_ID, fromStage: "setup", reason: "   " });

    expect(result).toEqual({ ok: false, error: "Add a short reason." });
    expect(client.calls).toHaveLength(0);
  });

  it("moves back one step with compare-and-set and logs the reason on the stage event", async () => {
    client = createFakeClient({ catering_orders: [order({ stage: "setup" }), landed] });

    const result = await moveOrderBack({ orderId: ORDER_ID, fromStage: "setup", reason });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(opArgs(client, "catering_orders", "update")?.[0]).toMatchObject({ stage: "confirm" });
    expect(filtersOn(client, "catering_orders", "update")).toContainEqual(["stage", "setup"]);
    expect(emitEventMock).toHaveBeenCalledWith(
      "catering_stage_change",
      expect.objectContaining({
        orderId: ORDER_ID,
        fromStage: "setup",
        toStage: "confirm",
        override: "move_back",
        reason,
        message: expect.stringContaining(`Moved back by a manager: ${reason}`),
      }),
    );
  });

  it("treats a repeat tap after the move landed as done, not a second step back", async () => {
    client = createFakeClient({ catering_orders: [order({ stage: "confirm" })] });

    const result = await moveOrderBack({ orderId: ORDER_ID, fromStage: "setup", reason });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(opArgs(client, "catering_orders", "update")).toBeUndefined();
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it("reports a lost compare-and-set instead of claiming success", async () => {
    client = createFakeClient({ catering_orders: [order({ stage: "setup" }), none] });

    expect(await moveOrderBack({ orderId: ORDER_ID, fromStage: "setup", reason })).toEqual({
      ok: false,
      error: "This order has changed. Refresh and try again.",
    });
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it("removes the open re-book call when moving back out of Closed", async () => {
    client = createFakeClient({
      catering_orders: [order({ stage: "closed" }), landed],
      catering_followups: [none],
    });

    const result = await moveOrderBack({ orderId: ORDER_ID, fromStage: "closed", reason });

    expect(result.ok).toBe(true);
    expect(opArgs(client, "catering_followups", "delete")).toBeDefined();
    expect(opArgs(client, "catering_followups", "is")).toEqual(["done_at", null]);
  });

  it("refuses New, cancelled orders, and a landing the cron would undo", async () => {
    client = createFakeClient({});
    expect(await moveOrderBack({ orderId: ORDER_ID, fromStage: "new", reason })).toEqual({
      ok: false,
      error: "New orders have no earlier stage.",
    });

    client = createFakeClient({ catering_orders: [order({ stage: "cancelled" })] });
    expect(await moveOrderBack({ orderId: ORDER_ID, fromStage: "followup", reason })).toEqual({
      ok: false,
      error: "This order is cancelled. Use Restore instead.",
    });

    client = createFakeClient({
      catering_orders: [order({ stage: "followup", event_date: "2020-01-01", event_time: "12:00:00" })],
    });
    expect(await moveOrderBack({ orderId: ORDER_ID, fromStage: "followup", reason })).toEqual({
      ok: false,
      error: "The event time has passed, so this order would go straight back to Follow-up.",
    });
    expect(emitEventMock).not.toHaveBeenCalled();
  });
});

describe("restoreOrder (manager override)", () => {
  const reason = "Cancelled by mistake";

  it("is refused without catering.override", async () => {
    denyKey("catering.override");
    client = createFakeClient({});

    expect(await restoreOrder({ orderId: ORDER_ID, toStage: "confirm", reason })).toEqual({
      ok: false,
      error: "You don't have permission to do this.",
    });
    expect(client.calls).toHaveLength(0);
  });

  it("is refused for an override holder without catering.manage, before touching the database", async () => {
    denyKey("catering.manage");
    client = createFakeClient({});

    expect(await restoreOrder({ orderId: ORDER_ID, toStage: "confirm", reason })).toEqual({
      ok: false,
      error: "You don't have permission to do this.",
    });
    expect(client.calls).toHaveLength(0);
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it("is refused for an order that is not cancelled", async () => {
    client = createFakeClient({ catering_orders: [order({ stage: "confirm" })] });

    expect(await restoreOrder({ orderId: ORDER_ID, toStage: "setup", reason })).toEqual({
      ok: false,
      error: "Only cancelled orders can be restored.",
    });
    expect(opArgs(client, "catering_orders", "update")).toBeUndefined();
  });

  it("requires an active target stage", async () => {
    client = createFakeClient({});

    for (const toStage of ["closed", "cancelled"]) {
      const result = await restoreOrder({
        orderId: ORDER_ID,
        toStage: toStage as "confirm",
        reason,
      });
      expect(result).toEqual({ ok: false, error: "Pick a stage to restore to." });
    }
    expect(client.calls).toHaveLength(0);
  });

  it("restores with compare-and-set on cancelled and logs the reason", async () => {
    client = createFakeClient({ catering_orders: [order({ stage: "cancelled" }), landed] });

    const result = await restoreOrder({ orderId: ORDER_ID, toStage: "confirm", reason });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(opArgs(client, "catering_orders", "update")?.[0]).toMatchObject({ stage: "confirm" });
    expect(filtersOn(client, "catering_orders", "update")).toContainEqual(["stage", "cancelled"]);
    expect(emitEventMock).toHaveBeenCalledWith(
      "catering_stage_change",
      expect.objectContaining({
        fromStage: "cancelled",
        toStage: "confirm",
        override: "restore",
        reason,
      }),
    );
  });
});

describe("rescaleOrderSetup (manual packing-list build)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 2026-08-21 09:00 New York.
    vi.setSystemTime(new Date("2026-08-21T13:00:00.000Z"));
  });

  const eventDayOrder = () =>
    order({
      stage: "setup",
      event_date: "2026-08-21",
      paper_goods: true,
      headcount: 10,
      fulfillment: "pickup",
      notes: null,
      selected_condiments: [],
    });
  const built = (fields: Record<string, unknown> = {}): Response => ({
    data: [{ generated: true, outcome: "built", setup_rows: 3, preorder_rows: 2, ...fields }],
    error: null,
  });

  /** The payload of the one catering_replace_setup call, or undefined. */
  function buildArgs(): Record<string, unknown> | undefined {
    const call = client.calls.find((c) => c.table === "rpc:catering_replace_setup");
    return call?.ops[0]?.[1][0] as Record<string, unknown> | undefined;
  }

  it("builds the list in one forced catering_replace_setup call, with no direct row writes", async () => {
    client = createFakeClient({
      catering_orders: [eventDayOrder()],
      catering_order_items: [{ data: [], error: null }],
      "rpc:catering_replace_setup": [built()],
    });

    expect(await rescaleOrderSetup({ orderId: ORDER_ID })).toEqual({ ok: true, data: undefined });

    const args = buildArgs();
    expect(Object.keys(args ?? {})).toEqual([
      "p_order_id",
      "p_force",
      "p_stages",
      "p_planned_from",
      "p_rows",
      "p_preorder_rows",
    ]);
    expect(args).toMatchObject({
      p_order_id: ORDER_ID,
      p_force: true,
      p_stages: ["new", "confirm", "setup", "out"],
      p_preorder_rows: planPreOrderRows(),
    });
    const rows = args?.p_rows as Array<Record<string, unknown>>;
    expect(rows.some((row) => row.setup_section === "paper_goods")).toBe(true);
    expect(rows.every((row) => Boolean(row.setup_section) && !("stage" in row))).toBe(true);
    // The stamp, the delete and the inserts all happen inside the function.
    expect(client.calls.filter((c) => c.table === "catering_checklist_items")).toEqual([]);
    expect(opArgs(client, "catering_orders", "update")).toBeUndefined();
    expect(client.calls.filter((c) => c.table === "rpc:catering_replace_setup")).toHaveLength(1);
  });

  it("sends what the list was planned from, so the database can refuse a stale build", async () => {
    client = createFakeClient({
      catering_orders: [eventDayOrder()],
      catering_order_items: [{ data: [{ menu_item_id: "menu-1", qty: 2 }], error: null }],
      catering_menu_items: [{ data: [{ id: "menu-1", name: "Large Hot Chick-fil-A Nuggets Tray" }], error: null }],
      "rpc:catering_replace_setup": [built()],
    });

    expect(await rescaleOrderSetup({ orderId: ORDER_ID })).toEqual({ ok: true, data: undefined });
    expect(buildArgs()?.p_planned_from).toEqual({
      headcount: 10,
      paper_goods: true,
      fulfillment: "pickup",
      notes: null,
      selected_condiments: [],
      items: [{ menu_item_id: "menu-1", qty: 2 }],
    });
  });

  it("asks the leader to try again when the order changed or moved during the build", async () => {
    for (const outcome of ["order_changed", "wrong_stage"]) {
      client = createFakeClient({
        catering_orders: [eventDayOrder()],
        catering_order_items: [{ data: [], error: null }],
        "rpc:catering_replace_setup": [built({ generated: false, outcome, setup_rows: 0, preorder_rows: 0 })],
      });

      expect(await rescaleOrderSetup({ orderId: ORDER_ID })).toEqual({
        ok: false,
        error: "This order changed while its packing list was building. Refresh the page and try again.",
      });
    }
  });

  it("reports a failed build and a failed line-item read instead of building from partial data", async () => {
    client = createFakeClient({
      catering_orders: [eventDayOrder()],
      catering_order_items: [{ data: [], error: null }],
      "rpc:catering_replace_setup": [{ data: null, error: { message: "check_violation" } }],
    });
    expect(await rescaleOrderSetup({ orderId: ORDER_ID })).toEqual({ ok: false, error: "check_violation" });

    client = createFakeClient({
      catering_orders: [eventDayOrder()],
      catering_order_items: [{ data: null, error: { message: "items read failed" } }],
    });
    expect(await rescaleOrderSetup({ orderId: ORDER_ID })).toEqual({ ok: false, error: "items read failed" });
    expect(buildArgs()).toBeUndefined();
  });

  it("refuses to rebuild the list on a Follow-up or Closed order", async () => {
    for (const stage of ["followup", "closed"]) {
      client = createFakeClient({ catering_orders: [order({ stage, event_date: "2026-08-20" })] });

      expect(await rescaleOrderSetup({ orderId: ORDER_ID })).toEqual({
        ok: false,
        error: "This order is past Pickup/Delivery, so its packing list can't be rebuilt.",
      });
      // Only the read; no delete, reset, or insert.
      expect(client.calls).toHaveLength(1);
    }
  });

  it("refuses a build two days before the event", async () => {
    client = createFakeClient({ catering_orders: [order({ stage: "confirm", event_date: "2026-08-23" })] });

    expect(await rescaleOrderSetup({ orderId: ORDER_ID })).toEqual({
      ok: false,
      error: "The packing list can't be built until the day before the event.",
    });
    expect(client.calls).toHaveLength(1);
  });
});

describe("searchCateringOrders", () => {
  const row = {
    id: ORDER_ID,
    guest_name: "Jane Doe",
    event_date: "2026-08-20",
    event_time: "11:30:00",
    stage: "confirm",
    headcount: 25,
  };

  beforeEach(() => {
    requirePermissionMock.mockClear();
  });

  it("requires catering.view and maps rows without phone or email", async () => {
    client = createFakeClient({
      catering_orders: [{ data: [{ ...row, phone: "5551234567", email: "j@example.com" }], error: null }],
    });

    const result = await searchCateringOrders({ query: "Jane" });

    expect(requirePermissionMock).toHaveBeenCalledWith("catering.view");
    expect(result).toEqual({
      ok: true,
      data: [
        {
          id: ORDER_ID,
          guestName: "Jane Doe",
          eventDate: "2026-08-20",
          eventTime: "11:30:00",
          stage: "confirm",
          headcount: 25,
        },
      ],
    });
    expect(opArgs(client, "catering_orders", "limit")).toEqual([20]);
    expect(opArgs(client, "catering_orders", "order")).toEqual(["event_date", { ascending: false }]);
  });

  it("matches a phone query on phone with a percent pattern between digits", async () => {
    client = createFakeClient({ catering_orders: [{ data: [], error: null }] });

    await searchCateringOrders({ query: "(555) 123" });

    expect(opArgs(client, "catering_orders", "ilike")).toEqual(["phone", "%5%5%5%1%2%3%"]);
  });

  it("matches a text query on guest_name and escapes wildcards", async () => {
    client = createFakeClient({ catering_orders: [{ data: [], error: null }] });

    await searchCateringOrders({ query: "50%_Jo" });

    expect(opArgs(client, "catering_orders", "ilike")).toEqual(["guest_name", "%50\\%\\_Jo%"]);
  });

  it("matches a date query on event_date", async () => {
    client = createFakeClient({ catering_orders: [{ data: [], error: null }] });

    await searchCateringOrders({ query: "2026-08-20" });

    expect(filtersOn(client, "catering_orders", "select")).toContainEqual(["event_date", "2026-08-20"]);
    expect(opArgs(client, "catering_orders", "ilike")).toBeUndefined();
  });

  it("makes no database call for an empty query", async () => {
    client = createFakeClient({});

    expect(await searchCateringOrders({ query: " a" })).toEqual({ ok: true, data: [] });
    expect(client.calls).toHaveLength(0);
  });

  it("returns the database error text", async () => {
    client = createFakeClient({ catering_orders: [{ data: null, error: { message: "boom" } }] });

    const result = await searchCateringOrders({ query: "Jane" });

    expect(result.ok).toBe(false);
  });
});

describe("reorderChecklistDefaults", () => {
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const ok: Response = { data: null, error: null };

  it("requires catering.manage", async () => {
    client = createFakeClient({
      catering_checklist_defaults: [{ data: [{ id: A }], error: null }, ok],
    });

    await reorderChecklistDefaults({ stage: "setup", orderedIds: [A] });

    expect(requirePermissionMock).toHaveBeenCalledWith("catering.manage");
  });

  it("writes sort 0..n-1 in the order given", async () => {
    client = createFakeClient({
      catering_checklist_defaults: [
        { data: [{ id: A }, { id: B }, { id: C }], error: null },
        ok,
        ok,
        ok,
      ],
    });

    const result = await reorderChecklistDefaults({ stage: "setup", orderedIds: [C, A, B] });

    expect(result).toEqual({ ok: true, data: undefined });
    const updates = client.calls.filter((c) => c.ops.some(([name]) => name === "update"));
    expect(updates).toHaveLength(3);
    expect(updates.map((c) => c.ops.find(([name]) => name === "update")![1])).toEqual([
      [{ sort: 0 }],
      [{ sort: 1 }],
      [{ sort: 2 }],
    ]);
    expect(updates.map((c) => c.ops.find(([name]) => name === "eq")![1])).toEqual([
      ["id", C],
      ["id", A],
      ["id", B],
    ]);
  });

  it("refuses a stale list and writes nothing", async () => {
    // The database has a default (C) the screen has not seen. Only the read is
    // queued, so any update would throw.
    client = createFakeClient({
      catering_checklist_defaults: [{ data: [{ id: A }, { id: B }, { id: C }], error: null }],
    });

    const result = await reorderChecklistDefaults({ stage: "setup", orderedIds: [B, A] });

    expect(result).toEqual({ ok: false, error: "The list changed. Refresh and try again." });
    expect(client.calls).toHaveLength(1);
  });
});
