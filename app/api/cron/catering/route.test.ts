import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { PRE_ORDER_CHECKLIST_ITEMS } from "@/app/(app)/catering/logic";

type QueryResponse = { data: unknown; error: { message: string } | null };

let queryResponse: QueryResponse;
let setupQueryResponse: QueryResponse;
let updateResponse: QueryResponse;
let setupOrderItemsResponse: QueryResponse;
let setupUpdateResponses: QueryResponse[];
/** Undone Confirmation Call items the cron's call check reads. */
let undoneCallItemsResponse: QueryResponse;
/** Pre-order labels an order already has, keyed by order id. */
let existingOutLabels: Record<string, string[]>;
const updates: Array<{ values: Record<string, unknown>; filters: Array<[string, string]> }> = [];
const events: Array<Record<string, unknown>> = [];
const inserts: Array<{ table: string; values: unknown }> = [];
const setupCandidateFilters: Array<[string, unknown]> = [];
const callCheckFilters: Array<[string, unknown]> = [];

function createFakeAdmin() {
  return {
    from(table: string) {
      if (table === "catering_orders") {
        const filters: Array<[string, string]> = [];
        const query: Record<string, unknown> = {};
        let selectsSetupCandidates = false;
        query.select = (columns: string) => {
          selectsSetupCandidates = columns.includes("setup_generated_at");
          return query;
        };
        query.eq = (column: string, value: string) => {
          filters.push([column, value]);
          return query;
        };
        query.in = (column: string, values: unknown) => {
          if (selectsSetupCandidates) setupCandidateFilters.push([column, values]);
          return query;
        };
        query.neq = () => query;
        query.is = () =>
          selectsSetupCandidates ? Promise.resolve(setupQueryResponse) : query;
        query.lte = () => Promise.resolve(queryResponse);
        query.update = (values: Record<string, unknown>) => {
          updates.push({ values, filters });
          const update: Record<string, unknown> = {};
          update.eq = (column: string, value: string) => {
            filters.push([column, value]);
            return update;
          };
          update.in = () => update;
          update.is = () => update;
          update.select = () => {
            const response = setupUpdateResponses.shift() ?? updateResponse;
            return {
              maybeSingle: () => Promise.resolve(response),
              then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
                Promise.resolve(response).then(resolve, reject),
            };
          };
          return update;
        };
        return query;
      }

      if (table === "catering_order_items") {
        return {
          select: () => ({ eq: () => Promise.resolve(setupOrderItemsResponse) }),
        };
      }

      if (table === "catering_checklist_items") {
        return {
          // Two reads: the batched call check (select "order_id") and the
          // per-order Pre-order label lookup (select "label").
          select: (columns: string) => {
            const filters: Array<[string, unknown]> = [];
            const query: Record<string, unknown> = {};
            query.in = (column: string, values: unknown) => {
              filters.push([column, values]);
              return query;
            };
            query.eq = (column: string, value: unknown) => {
              filters.push([column, value]);
              return query;
            };
            query.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
              let response: QueryResponse;
              if (columns === "order_id") {
                callCheckFilters.push(...filters);
                response = undoneCallItemsResponse;
              } else {
                const orderId = filters.find(([column]) => column === "order_id")?.[1] as string;
                response = {
                  data: (existingOutLabels[orderId] ?? []).map((label) => ({ label })),
                  error: null,
                };
              }
              return Promise.resolve(response).then(resolve, reject);
            };
            return query;
          },
          insert: (values: unknown) => {
            inserts.push({ table, values });
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === "app_events") {
        return {
          insert: (values: Record<string, unknown>) => {
            events.push(values);
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => createFakeAdmin(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { GET, POST } from "./route";

function makeRequest(authHeader?: string): NextRequest {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new NextRequest("https://example.test/api/cron/catering", { headers });
}

function setupCandidate(fields: Record<string, unknown>) {
  return {
    id: "setup-order",
    stage: "confirm",
    guest_name: "Catering Guest",
    event_date: "2026-08-21",
    setup_generated_at: null,
    headcount: 20,
    paper_goods: true,
    fulfillment: "delivery",
    notes: "Items:\n- 1x Small Hot Chick-fil-A Nuggets Tray\n- 1x 8oz Chick-fil-A Sauce",
    selected_condiments: [{ name: "8oz Chick-fil-A Sauce", qty: 1 }],
    ...fields,
  };
}

function insertedRows(): Array<Record<string, unknown>> {
  return inserts
    .filter((insert) => insert.table === "catering_checklist_items")
    .flatMap((insert) => insert.values as Array<Record<string, unknown>>);
}

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
  queryResponse = { data: [], error: null };
  setupQueryResponse = { data: [], error: null };
  updateResponse = { data: [], error: null };
  undoneCallItemsResponse = { data: [], error: null };
  existingOutLabels = {};
  updates.length = 0;
  events.length = 0;
  inserts.length = 0;
  setupCandidateFilters.length = 0;
  callCheckFilters.length = 0;
  setupOrderItemsResponse = { data: [], error: null };
  setupUpdateResponses = [];
  vi.useFakeTimers();
  // 2026-08-20 14:00 New York: today is 08-20, tomorrow is 08-21.
  vi.setSystemTime(new Date("2026-08-20T18:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("catering cron route", () => {
  it("rejects requests without the configured cron bearer token", async () => {
    const res = await GET(makeRequest("Bearer wrong"));
    expect(res.status).toBe(401);
  });

  it("atomically advances due pickup and delivery handoffs once", async () => {
    queryResponse = {
      data: [
        {
          id: "due-order",
          stage: "out",
          fulfillment: "delivery",
          event_date: "2026-08-20",
          event_time: "14:00:00",
          guest_name: "Catering Guest",
        },
      ],
      error: null,
    };
    updateResponse = { data: [{ id: "due-order" }], error: null };

    const res = await POST(makeRequest("Bearer test-secret"));
    expect(await res.json()).toEqual({ ok: true, scanned: 1, advanced: 1, errors: [] });
    expect(updates).toHaveLength(1);
    expect(updates[0].values.stage).toBe("followup");
    expect(updates[0].filters).toContainEqual(["stage", "out"]);
    expect(events).toHaveLength(1);
    expect(events[0].event_key).toBe("catering_stage_change");
  });

  it("builds the day-before setup from exact receipt condiments and moves a confirmed order to FOH Setup", async () => {
    setupQueryResponse = { data: [setupCandidate({})], error: null };
    setupUpdateResponses = [
      { data: { id: "setup-order" }, error: null },
      { data: { id: "setup-order" }, error: null },
    ];

    const res = await POST(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(updates.some((update) => update.values.setup_generated_at != null)).toBe(true);
    expect(updates.some((update) => update.values.stage === "setup")).toBe(true);
    expect(insertedRows()).toContainEqual(expect.objectContaining({
      setup_section: "sauces_dressings",
      label: "8oz Chick-fil-A Sauce - 1",
    }));
    expect(insertedRows().some((item) => item.setup_section === "food")).toBe(false);
    // The call check reads undone Confirmation Call items for the candidates.
    expect(callCheckFilters).toEqual(
      expect.arrayContaining([
        ["order_id", ["setup-order"]],
        ["stage", "confirm"],
        ["done", false],
      ]),
    );
    expect(events).toContainEqual(expect.objectContaining({ event_key: "catering_stage_change" }));
    const payload = events[0].payload as Record<string, unknown>;
    expect(payload).toMatchObject({ fromStage: "confirm", toStage: "setup" });
    expect(payload.message).toContain("2026-08-21");
  });

  it("builds the packing list for an order whose call is not done but leaves it where it is", async () => {
    setupQueryResponse = { data: [setupCandidate({ stage: "new" })], error: null };
    undoneCallItemsResponse = { data: [{ order_id: "setup-order" }], error: null };
    setupUpdateResponses = [{ data: { id: "setup-order" }, error: null }];

    const res = await POST(makeRequest("Bearer test-secret"));
    expect(await res.json()).toMatchObject({ ok: true, errors: [] });
    expect(updates.some((update) => update.values.setup_generated_at != null)).toBe(true);
    expect(insertedRows().some((item) => item.setup_section === "sauces_dressings")).toBe(true);
    expect(insertedRows().filter((item) => item.stage === "out")).toHaveLength(PRE_ORDER_CHECKLIST_ITEMS.length);
    expect(updates.some((update) => update.values.stage === "setup")).toBe(false);
    expect(events).toHaveLength(0);
  });

  it("builds a missing packing list on the event day, for same-day orders", async () => {
    setupQueryResponse = {
      data: [setupCandidate({ id: "same-day-order", stage: "setup", event_date: "2026-08-20" })],
      error: null,
    };
    setupUpdateResponses = [{ data: { id: "same-day-order" }, error: null }];

    const res = await POST(makeRequest("Bearer test-secret"));
    expect(await res.json()).toMatchObject({ ok: true, errors: [] });
    // Candidates come from today and tomorrow, in the store's time zone.
    expect(setupCandidateFilters).toContainEqual(["event_date", ["2026-08-20", "2026-08-21"]]);
    expect(updates.some((update) => update.values.setup_generated_at != null)).toBe(true);
    expect(insertedRows().some((item) => item.setup_section === "sauces_dressings")).toBe(true);
    // Already in FOH Setup, so no move and no call check for it.
    expect(updates.some((update) => update.values.stage === "setup")).toBe(false);
    expect(callCheckFilters).toHaveLength(0);
  });

  it("does not add Pre-order items again when rebuilding a list wiped by an edit", async () => {
    setupQueryResponse = { data: [setupCandidate({ stage: "setup" })], error: null };
    existingOutLabels = { "setup-order": [...PRE_ORDER_CHECKLIST_ITEMS] };
    setupUpdateResponses = [{ data: { id: "setup-order" }, error: null }];

    await POST(makeRequest("Bearer test-secret"));
    expect(insertedRows().some((item) => item.setup_section === "sauces_dressings")).toBe(true);
    expect(insertedRows().filter((item) => item.stage === "out")).toEqual([]);
  });

  it("adds only the Pre-order items an order is missing", async () => {
    setupQueryResponse = { data: [setupCandidate({ stage: "setup" })], error: null };
    existingOutLabels = { "setup-order": [PRE_ORDER_CHECKLIST_ITEMS[0]] };
    setupUpdateResponses = [{ data: { id: "setup-order" }, error: null }];

    await POST(makeRequest("Bearer test-secret"));
    expect(insertedRows().filter((item) => item.stage === "out").map((item) => item.label)).toEqual([
      PRE_ORDER_CHECKLIST_ITEMS[1],
      PRE_ORDER_CHECKLIST_ITEMS[2],
    ]);
  });

  it("moves nothing when the call check cannot be read, but still builds the list", async () => {
    setupQueryResponse = { data: [setupCandidate({})], error: null };
    undoneCallItemsResponse = { data: null, error: { message: "read failed" } };
    setupUpdateResponses = [{ data: { id: "setup-order" }, error: null }];

    const res = await POST(makeRequest("Bearer test-secret"));
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.errors).toEqual(["confirmation calls: read failed"]);
    expect(insertedRows().length).toBeGreaterThan(0);
    expect(updates.some((update) => update.values.stage === "setup")).toBe(false);
  });
});
