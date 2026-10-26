import { beforeEach, describe, expect, it, vi } from "vitest";

import { PermissionError } from "@/lib/auth/permissions";

/**
 * Server-action coverage for driver reservations. Same queued fake-client
 * pattern as app/(app)/catering/actions.test.ts: one canned response per
 * `.from(table)` call, in the action's real query order, and a table with
 * nothing queued throws, which is how a test proves a query never ran.
 */

const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const MESSIAH = "44444444-4444-4444-8444-444444444444";
const JORDAN = "55555555-5555-4555-8555-555555555555";

type Response = { data: unknown; error: { message: string } | null };
type Op = [method: string, args: unknown[]];

const CHAIN = ["select", "eq", "in", "insert", "update", "upsert", "delete"] as const;

function createFakeClient(responses: Record<string, Response[]>) {
  const calls: Array<{ table: string; ops: Op[] }> = [];
  return {
    calls,
    from(table: string) {
      const queue = responses[table];
      if (!queue || queue.length === 0) throw new Error(`no mock response queued for table "${table}"`);
      const response = queue.shift()!;
      const call = { table, ops: [] as Op[] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const method of CHAIN) {
        builder[method] = (...args: unknown[]) => {
          call.ops.push([method, args]);
          return builder;
        };
      }
      builder.maybeSingle = async () => response;
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject);
      return builder;
    },
    auth: { getUser: async () => ({ data: { user: { id: ACTOR_ID } } }) },
  };
}

const requirePermissionMock = vi.fn(async (key: string) => {
  void key;
});
const emitEventMock = vi.fn(async (key: string, payload: Record<string, unknown>) => {
  void key;
  void payload;
});
let client: ReturnType<typeof createFakeClient>;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    requirePermission: (key: Parameters<typeof actual.requirePermission>[0]) => requirePermissionMock(key),
  };
});
vi.mock("@/lib/events/bus", () => ({
  emitEvent: (key: string, payload: Record<string, unknown>) => emitEventMock(key, payload),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));

import { saveDriver, setDeliveryPlatform, setEscalationContact, setOrderDrivers } from "./actions";

const deliveryOrder: Response = {
  data: {
    id: ORDER_ID,
    guest_name: "Lisa",
    event_date: "2026-10-13",
    event_time: "11:00:00",
    fulfillment: "delivery",
    stage: "confirm",
    delivery_platform: "roadway",
  },
  error: null,
};

function denyKey(denied: string) {
  requirePermissionMock.mockImplementation(async (key: string) => {
    if (key === denied) throw new PermissionError(denied as ConstructorParameters<typeof PermissionError>[0]);
  });
}

function ops(table: string, method: string) {
  return client.calls.filter((c) => c.table === table).flatMap((c) => c.ops.filter(([m]) => m === method));
}

beforeEach(() => {
  requirePermissionMock.mockReset();
  requirePermissionMock.mockImplementation(async () => undefined);
  emitEventMock.mockClear();
});

describe("setOrderDrivers", () => {
  it("refuses without catering.drivers before reading anything", async () => {
    denyKey("catering.drivers");
    client = createFakeClient({});
    const result = await setOrderDrivers({ orderId: ORDER_ID, profileIds: [MESSIAH] });
    expect(result.ok).toBe(false);
    expect(client.calls).toEqual([]);
  });

  it("marks a driver reserved and tells only that driver", async () => {
    client = createFakeClient({
      catering_orders: [deliveryOrder],
      catering_order_drivers: [
        { data: [], error: null },
        { data: [{ profile_id: MESSIAH }], error: null },
      ],
      catering_drivers: [{ data: [{ profile_id: MESSIAH }], error: null }],
    });
    const result = await setOrderDrivers({ orderId: ORDER_ID, profileIds: [MESSIAH] });
    expect(result).toEqual({ ok: true, data: { added: 1, removed: 0 } });
    expect(ops("catering_order_drivers", "upsert")[0][1]).toEqual([
      [{ order_id: ORDER_ID, profile_id: MESSIAH, reserved_by: ACTOR_ID }],
      { onConflict: "order_id,profile_id", ignoreDuplicates: true },
    ]);
    expect(emitEventMock).toHaveBeenCalledTimes(1);
    expect(emitEventMock.mock.calls[0][0]).toBe("catering_driver_assigned");
    expect(emitEventMock.mock.calls[0][1]).toMatchObject({
      user_ids: [MESSIAH],
      title: "You're delivering for Lisa",
    });
  });

  it("is a no-op on a double tap: nothing written, nobody told", async () => {
    client = createFakeClient({
      catering_orders: [deliveryOrder],
      catering_order_drivers: [{ data: [{ profile_id: MESSIAH }], error: null }],
    });
    const result = await setOrderDrivers({ orderId: ORDER_ID, profileIds: [MESSIAH] });
    expect(result).toEqual({ ok: true, data: { added: 0, removed: 0 } });
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it("does not tell a driver a concurrent tap already added", async () => {
    client = createFakeClient({
      catering_orders: [deliveryOrder],
      catering_order_drivers: [
        { data: [], error: null },
        { data: [], error: null },
      ],
      catering_drivers: [{ data: [{ profile_id: MESSIAH }], error: null }],
    });
    const result = await setOrderDrivers({ orderId: ORDER_ID, profileIds: [MESSIAH] });
    expect(result).toEqual({ ok: true, data: { added: 0, removed: 0 } });
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it("swaps drivers: adds the new one and removes the old one", async () => {
    client = createFakeClient({
      catering_orders: [deliveryOrder],
      catering_order_drivers: [
        { data: [{ profile_id: JORDAN }], error: null },
        { data: [{ profile_id: MESSIAH }], error: null },
        { data: null, error: null },
      ],
      catering_drivers: [{ data: [{ profile_id: MESSIAH }], error: null }],
    });
    const result = await setOrderDrivers({ orderId: ORDER_ID, profileIds: [MESSIAH] });
    expect(result).toEqual({ ok: true, data: { added: 1, removed: 1 } });
    expect(ops("catering_order_drivers", "in")).toContainEqual(["in", ["profile_id", [JORDAN]]]);
  });

  it("refuses a driver who is not on the active roster", async () => {
    client = createFakeClient({
      catering_orders: [deliveryOrder],
      catering_order_drivers: [{ data: [], error: null }],
      catering_drivers: [{ data: [], error: null }],
    });
    const result = await setOrderDrivers({ orderId: ORDER_ID, profileIds: [MESSIAH] });
    expect(result).toEqual({ ok: false, error: "Pick drivers from the active driver list." });
    expect(ops("catering_order_drivers", "upsert")).toEqual([]);
  });

  it("refuses a pickup order", async () => {
    client = createFakeClient({
      catering_orders: [{ data: { ...(deliveryOrder.data as object), fulfillment: "pickup" }, error: null }],
    });
    expect(await setOrderDrivers({ orderId: ORDER_ID, profileIds: [MESSIAH] })).toEqual({
      ok: false,
      error: "Only delivery orders get a driver.",
    });
  });

  it("keeps the reservation when the driver notification fails", async () => {
    emitEventMock.mockRejectedValueOnce(new Error("events down"));
    client = createFakeClient({
      catering_orders: [deliveryOrder],
      catering_order_drivers: [
        { data: [], error: null },
        { data: [{ profile_id: MESSIAH }], error: null },
      ],
      catering_drivers: [{ data: [{ profile_id: MESSIAH }], error: null }],
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await setOrderDrivers({ orderId: ORDER_ID, profileIds: [MESSIAH] })).toEqual({
      ok: true,
      data: { added: 1, removed: 0 },
    });
    spy.mockRestore();
  });
});

describe("setDeliveryPlatform", () => {
  it("needs catering.manage, like any other order edit", async () => {
    denyKey("catering.manage");
    client = createFakeClient({});
    expect((await setDeliveryPlatform({ orderId: ORDER_ID, platform: "ezcater" })).ok).toBe(false);
    expect(client.calls).toEqual([]);
  });

  it("only changes delivery orders", async () => {
    client = createFakeClient({ catering_orders: [{ data: null, error: null }] });
    expect(await setDeliveryPlatform({ orderId: ORDER_ID, platform: "ezcater" })).toEqual({
      ok: false,
      error: "Only delivery orders have a driver app.",
    });
    expect(ops("catering_orders", "eq")).toContainEqual(["eq", ["fulfillment", "delivery"]]);
  });
});

describe("roster and escalation contact", () => {
  it("needs catering.drivers to edit the roster", async () => {
    denyKey("catering.drivers");
    client = createFakeClient({});
    const result = await saveDriver({
      profileId: MESSIAH,
      carSize: "large",
      hasRoadwayApp: true,
      hasEzcaterApp: true,
      active: true,
    });
    expect(result.ok).toBe(false);
    expect(client.calls).toEqual([]);
  });

  it("will not add an inactive team member as a driver", async () => {
    client = createFakeClient({ profiles: [{ data: null, error: null }] });
    const result = await saveDriver({
      profileId: MESSIAH,
      carSize: "small",
      hasRoadwayApp: true,
      hasEzcaterApp: false,
      active: true,
    });
    expect(result).toEqual({ ok: false, error: "That team member is not active." });
  });

  it("needs settings.manage to change who gets escalations", async () => {
    denyKey("settings.manage");
    client = createFakeClient({});
    expect((await setEscalationContact({ profileId: MESSIAH })).ok).toBe(false);
    expect(client.calls).toEqual([]);
  });

  it("can clear the escalation contact", async () => {
    client = createFakeClient({ catering_driver_settings: [{ data: { id: true }, error: null }] });
    expect(await setEscalationContact({ profileId: null })).toEqual({ ok: true, data: undefined });
  });
});
