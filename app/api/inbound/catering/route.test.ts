import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Coverage for the inbound catering email route: auth guard (fail-closed),
 * the happy-path order creation flow against a DB-shaped fake service client,
 * the duplicate guard, and the unparseable-email stub. The parser itself has
 * its own pure-logic tests in lib/catering/inbound-email.test.ts.
 */

type Response = { data?: unknown; error?: { message: string } | null };

interface InsertRecord {
  table: string;
  values: unknown;
}

const inserts: InsertRecord[] = [];

function createFakeAdmin(responses: Record<string, Response[]>) {
  return {
    from(table: string) {
      const queue = responses[table];
      if (!queue || queue.length === 0) {
        throw new Error(`no mock response queued for table "${table}"`);
      }
      const response = queue.shift()!;
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.limit = chain;
      builder.order = chain;
      builder.insert = (values: unknown) => {
        inserts.push({ table, values });
        return builder;
      };
      builder.maybeSingle = () => Promise.resolve({ data: response.data ?? null, error: response.error ?? null });
      builder.single = () => Promise.resolve({ data: response.data ?? null, error: response.error ?? null });
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: response.data ?? null, error: response.error ?? null }).then(resolve, reject);
      return builder;
    },
  };
}

let fakeAdmin: ReturnType<typeof createFakeAdmin>;

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => fakeAdmin,
}));

import { POST } from "./route";

const GOOD_BODY = `Catering Pickup Order for 04093
Pickup Time
Friday 7/10/2026 at 11:00am
Customer Information
Marissa Cancellieri
+16313358148
surfers117@hotmail.com
Guest Count:  125
Paper Goods:  No
Special Instructions
lots of napkins
Item Name
Quantity
Price
8 ct Chick-fil-A® Nuggets
2
$10.83
Mystery Tray Nobody Sells
1
Subtotal
$1353.75
Tax
$118.45
Total
$1472.20
`;

function makeRequest(json: unknown, authHeader?: string): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new NextRequest("https://example.test/api/inbound/catering", {
    method: "POST",
    headers,
    body: JSON.stringify(json),
  });
}

beforeEach(() => {
  process.env.CATERING_INBOUND_SECRET = "test-secret";
  inserts.length = 0;
});

describe("POST /api/inbound/catering auth", () => {
  it("rejects when the env secret is unset (fail closed)", async () => {
    delete process.env.CATERING_INBOUND_SECRET;
    const response = await POST(makeRequest({ subject: "s", body: "b" }, "Bearer anything"));
    expect(response.status).toBe(401);
  });

  it("rejects a wrong secret", async () => {
    const response = await POST(makeRequest({ subject: "s", body: "b" }, "Bearer wrong"));
    expect(response.status).toBe(401);
  });

  it("rejects a missing body", async () => {
    fakeAdmin = createFakeAdmin({});
    const response = await POST(makeRequest({}, "Bearer test-secret"));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/inbound/catering happy path", () => {
  it("creates the order at the new stage with items, checklists, and event", async () => {
    fakeAdmin = createFakeAdmin({
      catering_orders: [
        { data: null }, // duplicate check: none
        { data: { id: "order-1" } }, // insert
      ],
      catering_contacts: [
        { data: null }, // phone lookup
        { data: null }, // email lookup
        { data: { id: "contact-1" } }, // insert
      ],
      catering_menu_items: [
        {
          data: [
            { id: "menu-1", name: "8 ct Chick-fil-A® Nuggets", components: null, scaling_rules: null },
          ],
        },
      ],
      catering_order_items: [{ error: null }],
      catering_checklist_defaults: [
        { data: [{ stage: "confirm", label: "Called guest to confirm", sort: 0 }] },
      ],
      catering_checklist_items: [{ error: null }],
      app_events: [{ error: null }],
    });

    const response = await POST(
      makeRequest(
        {
          subject: "Incoming Catering Order: Pickup Order Received for (04093)",
          body: GOOD_BODY,
          messageId: "msg-1",
        },
        "Bearer test-secret",
      ),
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({ ok: true, orderId: "order-1", parsed: true, matchedItems: 1, unmatchedItems: 1 });

    const orderInsert = inserts.find((i) => i.table === "catering_orders")?.values as Record<string, unknown>;
    expect(orderInsert).toMatchObject({
      guest_name: "Marissa Cancellieri",
      event_date: "2026-07-10",
      event_time: "11:00",
      headcount: 125,
      amount: 1472.2,
      stage: "new",
      fulfillment: "pickup",
      source: "email:04093",
      contact_id: "contact-1",
      phone: "16313358148",
    });
    expect(String(orderInsert.notes)).toContain("Not in menu (add manually): Mystery Tray Nobody Sells");

    const itemsInsert = inserts.find((i) => i.table === "catering_order_items")?.values as unknown[];
    expect(itemsInsert).toEqual([{ order_id: "order-1", menu_item_id: "menu-1", qty: 2 }]);

    const eventInsert = inserts.find((i) => i.table === "app_events")?.values as Record<string, unknown>;
    expect(eventInsert.event_key).toBe("catering_order_new");
    const payload = eventInsert.payload as Record<string, unknown>;
    expect(payload.orderId).toBe("order-1");
    expect(String(payload.message)).toContain("Marissa Cancellieri");
    expect(String(payload.message)).toContain("Total $1472.20");
  });

  it("skips duplicates by source key", async () => {
    fakeAdmin = createFakeAdmin({
      catering_orders: [{ data: { id: "existing-1" } }],
    });
    const response = await POST(
      makeRequest(
        {
          subject: "Incoming Catering Order: Pickup Order Received for (04093)",
          body: GOOD_BODY,
        },
        "Bearer test-secret",
      ),
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({ ok: true, duplicate: true, orderId: "existing-1" });
    expect(inserts).toEqual([]);
  });

  it("files an unparseable email as a NEEDS REVIEW stub instead of dropping it", async () => {
    fakeAdmin = createFakeAdmin({
      catering_orders: [
        { data: null }, // duplicate check keyed on messageId
        { data: { id: "order-2" } },
      ],
      catering_checklist_defaults: [{ data: [] }],
      app_events: [{ error: null }],
    });
    const response = await POST(
      makeRequest({ subject: "something odd", body: "no order here", messageId: "msg-9" }, "Bearer test-secret"),
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toMatchObject({ ok: true, orderId: "order-2", parsed: false });

    const orderInsert = inserts.find((i) => i.table === "catering_orders")?.values as Record<string, unknown>;
    expect(orderInsert.guest_name).toBe("Unparsed catering email");
    expect(orderInsert.source).toBe("email:msg-9");
    expect(orderInsert.stage).toBe("new");
    expect(String(orderInsert.notes)).toContain("NEEDS REVIEW");
    expect(String(orderInsert.notes)).toContain("no order here");

    const eventInsert = inserts.find((i) => i.table === "app_events")?.values as Record<string, unknown>;
    expect(String((eventInsert.payload as Record<string, unknown>).message)).toContain("NEEDS REVIEW");
  });
});
