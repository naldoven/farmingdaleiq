import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { PRE_ORDER_CHECKLIST_ITEMS, planPreOrderRows } from "@/app/(app)/catering/logic";

type QueryResponse = { data: unknown; error: { message: string } | null };

let queryResponse: QueryResponse;
let setupQueryResponse: QueryResponse;
let updateResponse: QueryResponse;
let setupOrderItemsResponse: QueryResponse;
let setupUpdateResponses: QueryResponse[];
/** Confirmation Call rows (order_id, done) the cron's call check reads. */
let callItemsResponse: QueryResponse;
/** Answers to catering_replace_setup, one per call; a built list when empty. */
let rpcResponses: QueryResponse[];
const updates: Array<{ values: Record<string, unknown>; filters: Array<[string, string]> }> = [];
const events: Array<Record<string, unknown>> = [];
const setupCandidateFilters: Array<[string, unknown]> = [];
/** Direct writes to catering_checklist_items. The build must make none. */
const checklistWrites: Array<{ op: "delete" | "insert" }> = [];
const callCheckFilters: Array<[string, unknown]> = [];
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

function createFakeAdmin() {
  return {
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      const response = rpcResponses.shift() ?? {
        data: [{ generated: true, outcome: "built", setup_rows: 2, preorder_rows: 3 }],
        error: null,
      };
      return Promise.resolve(response);
    },
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

      if (table === "catering_menu_items") {
        return {
          select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
        };
      }

      if (table === "catering_checklist_items") {
        return {
          // The batched Confirmation Call check (select "order_id, done").
          select: () => {
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
              callCheckFilters.push(...filters);
              return Promise.resolve(callItemsResponse).then(resolve, reject);
            };
            return query;
          },
          delete: () => {
            checklistWrites.push({ op: "delete" });
            throw new Error("the cron must not delete checklist rows directly");
          },
          insert: () => {
            checklistWrites.push({ op: "insert" });
            throw new Error("the cron must not insert checklist rows directly");
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

// The digest has its own tests (digest.test.ts). Mocking it keeps this file's
// fake client from needing the job_cursors tables.
const queueTomorrowDigest = vi.fn(async (): Promise<{ status: string; error?: string }> => ({
  status: "too_early",
}));
vi.mock("./digest", () => ({
  queueTomorrowDigest: (...args: unknown[]) => (queueTomorrowDigest as (...a: unknown[]) => unknown)(...args),
}));

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
    // Created and last moved well before the build window opened.
    created_at: "2026-08-10T15:00:00.000Z",
    stage_changed_at: "2026-08-10T15:00:00.000Z",
    headcount: 20,
    paper_goods: true,
    fulfillment: "delivery",
    notes: "Items:\n- 1x Small Hot Chick-fil-A Nuggets Tray\n- 1x 8oz Chick-fil-A Sauce",
    selected_condiments: [{ name: "8oz Chick-fil-A Sauce", qty: 1 }],
    ...fields,
  };
}

/** The generated rows the one build call sent. */
function builtRows(): Array<Record<string, unknown>> {
  return (rpcCalls[0]?.args.p_rows ?? []) as Array<Record<string, unknown>>;
}

const notBuilt = (outcome: string): QueryResponse => ({
  data: [{ generated: false, outcome, setup_rows: 0, preorder_rows: 0 }],
  error: null,
});

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
  queryResponse = { data: [], error: null };
  setupQueryResponse = { data: [], error: null };
  updateResponse = { data: [], error: null };
  callItemsResponse = { data: [], error: null };
  rpcResponses = [];
  updates.length = 0;
  events.length = 0;
  setupCandidateFilters.length = 0;
  checklistWrites.length = 0;
  callCheckFilters.length = 0;
  rpcCalls.length = 0;
  setupOrderItemsResponse = { data: [], error: null };
  setupUpdateResponses = [];
  queueTomorrowDigest.mockReset();
  queueTomorrowDigest.mockResolvedValue({ status: "too_early" });
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
    expect(await res.json()).toEqual({
      ok: true,
      scanned: 1,
      advanced: 1,
      digest: "too_early",
      errors: [],
    });
    expect(updates).toHaveLength(1);
    expect(updates[0].values.stage).toBe("followup");
    expect(updates[0].filters).toContainEqual(["stage", "out"]);
    expect(events).toHaveLength(1);
    expect(events[0].event_key).toBe("catering_stage_change");
  });

  it("builds the day-before setup from exact receipt condiments and moves a confirmed order to FOH Setup", async () => {
    setupQueryResponse = { data: [setupCandidate({})], error: null };
    callItemsResponse = {
      data: [
        { order_id: "setup-order", done: true },
        { order_id: "setup-order", done: true },
      ],
      error: null,
    };
    setupUpdateResponses = [{ data: { id: "setup-order" }, error: null }];

    const res = await POST(makeRequest("Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(builtRows()).toContainEqual(
      expect.objectContaining({ setup_section: "sauces_dressings", label: "8oz Chick-fil-A Sauce - 1" }),
    );
    expect(builtRows().some((item) => item.setup_section === "food")).toBe(false);
    // The stamp is written by the build function, not by the cron itself.
    expect(updates.some((update) => "setup_generated_at" in update.values)).toBe(false);
    expect(updates).toHaveLength(1);
    expect(updates[0].values.stage).toBe("setup");
    expect(updates[0].filters).toContainEqual(["stage", "confirm"]);
    // The call check reads every Confirmation Call row for the candidates.
    expect(callCheckFilters).toEqual([
      ["order_id", ["setup-order"]],
      ["stage", "confirm"],
    ]);
    expect(events).toHaveLength(1);
    const payload = events[0].payload as Record<string, unknown>;
    expect(payload).toMatchObject({ fromStage: "confirm", toStage: "setup" });
    expect(payload.message).toContain("2026-08-21");
  });

  it("builds through one unforced catering_replace_setup call and never writes rows directly", async () => {
    setupQueryResponse = { data: [setupCandidate({ stage: "setup" })], error: null };
    setupOrderItemsResponse = { data: [{ menu_item_id: "menu-1", qty: 1 }], error: null };

    const res = await POST(makeRequest("Bearer test-secret"));
    expect(await res.json()).toMatchObject({ ok: true, errors: [] });
    expect(checklistWrites).toEqual([]);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("catering_replace_setup");
    expect(Object.keys(rpcCalls[0].args)).toEqual([
      "p_order_id",
      "p_force",
      "p_stages",
      "p_planned_from",
      "p_rows",
      "p_preorder_rows",
    ]);
    expect(rpcCalls[0].args).toMatchObject({
      p_order_id: "setup-order",
      p_force: false,
      p_stages: ["new", "confirm", "setup"],
      p_planned_from: {
        headcount: 20,
        paper_goods: true,
        fulfillment: "delivery",
        notes: "Items:\n- 1x Small Hot Chick-fil-A Nuggets Tray\n- 1x 8oz Chick-fil-A Sauce",
        selected_condiments: [{ name: "8oz Chick-fil-A Sauce", qty: 1 }],
        items: [{ menu_item_id: "menu-1", qty: 1 }],
      },
    });
    expect(builtRows().every((row) => Boolean(row.setup_section))).toBe(true);
  });

  it("sends every Pre-order item and leaves skipping the ones an order has to the database", async () => {
    setupQueryResponse = { data: [setupCandidate({ stage: "setup" })], error: null };

    await POST(makeRequest("Bearer test-secret"));
    expect(rpcCalls[0].args.p_preorder_rows).toEqual(planPreOrderRows());
    expect(planPreOrderRows()).toHaveLength(PRE_ORDER_CHECKLIST_ITEMS.length);
  });

  it("builds the packing list for an order whose call is not done but leaves it where it is", async () => {
    setupQueryResponse = { data: [setupCandidate({ stage: "new" })], error: null };
    callItemsResponse = {
      data: [
        { order_id: "setup-order", done: true },
        { order_id: "setup-order", done: false },
      ],
      error: null,
    };

    const res = await POST(makeRequest("Bearer test-secret"));
    expect(await res.json()).toMatchObject({ ok: true, errors: [] });
    expect(builtRows().some((item) => item.setup_section === "sauces_dressings")).toBe(true);
    expect(updates).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it("builds the list but does not undo a manager's move back after an edit wiped it", async () => {
    // The manager moved it back to Confirmation Call at 11:00 New York on the
    // day before, then an edit cleared the list. The call is fully ticked.
    setupQueryResponse = {
      data: [setupCandidate({ stage: "confirm", stage_changed_at: "2026-08-20T15:00:00.000Z" })],
      error: null,
    };
    callItemsResponse = { data: [{ order_id: "setup-order", done: true }], error: null };

    const res = await POST(makeRequest("Bearer test-secret"));
    expect(await res.json()).toMatchObject({ ok: true, errors: [] });
    expect(rpcCalls).toHaveLength(1);
    expect(updates).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it("does not move an order that has no Confirmation Call items", async () => {
    setupQueryResponse = { data: [setupCandidate({ stage: "new" })], error: null };
    callItemsResponse = { data: [], error: null };

    await POST(makeRequest("Bearer test-secret"));
    expect(builtRows().length).toBeGreaterThan(0);
    expect(updates).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it("skips an order created under two minutes ago: no build, no move", async () => {
    setupQueryResponse = {
      data: [
        setupCandidate({
          stage: "new",
          created_at: "2026-08-20T17:59:00.000Z",
          stage_changed_at: "2026-08-20T17:59:00.000Z",
        }),
      ],
      error: null,
    };

    const res = await POST(makeRequest("Bearer test-secret"));
    expect(await res.json()).toMatchObject({ ok: true, errors: [] });
    expect(rpcCalls).toHaveLength(0);
    expect(updates).toHaveLength(0);
    expect(callCheckFilters).toHaveLength(0);
  });

  it("stays quiet when the database skips the build: no move, no event, no error", async () => {
    // already_built: an overlapping run or a leader built it after this run
    // read the order. order_changed: an edit landed mid-build (it nulled the
    // stamp, so the next run rebuilds). wrong_stage: it was moved or cancelled.
    for (const outcome of ["already_built", "order_changed", "wrong_stage"]) {
      setupQueryResponse = { data: [setupCandidate({})], error: null };
      callItemsResponse = { data: [{ order_id: "setup-order", done: true }], error: null };
      rpcResponses = [notBuilt(outcome)];
      updates.length = 0;
      events.length = 0;

      const res = await POST(makeRequest("Bearer test-secret"));
      expect(await res.json()).toMatchObject({ ok: true, errors: [] });
      expect(updates).toHaveLength(0);
      expect(events).toHaveLength(0);
    }
  });

  it("reports a failed build, and neither moves the order nor emits an event", async () => {
    setupQueryResponse = { data: [setupCandidate({})], error: null };
    callItemsResponse = { data: [{ order_id: "setup-order", done: true }], error: null };
    rpcResponses = [{ data: null, error: { message: "build failed" } }];

    const res = await POST(makeRequest("Bearer test-secret"));
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.errors).toEqual(["setup-order: build failed"]);
    expect(updates).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it("builds a missing packing list on the event day, for same-day orders", async () => {
    setupQueryResponse = {
      data: [setupCandidate({ id: "same-day-order", stage: "setup", event_date: "2026-08-20" })],
      error: null,
    };

    const res = await POST(makeRequest("Bearer test-secret"));
    expect(await res.json()).toMatchObject({ ok: true, errors: [] });
    // Candidates come from today and tomorrow, in the store's time zone.
    expect(setupCandidateFilters).toContainEqual(["event_date", ["2026-08-20", "2026-08-21"]]);
    expect(rpcCalls[0].args.p_order_id).toBe("same-day-order");
    expect(builtRows().some((item) => item.setup_section === "sauces_dressings")).toBe(true);
    // Already in FOH Setup, so no move and no call check for it.
    expect(updates).toHaveLength(0);
    expect(callCheckFilters).toHaveLength(0);
  });

  it("moves nothing when the call check cannot be read, but still builds the list", async () => {
    setupQueryResponse = { data: [setupCandidate({})], error: null };
    callItemsResponse = { data: null, error: { message: "read failed" } };

    const res = await POST(makeRequest("Bearer test-secret"));
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.errors).toEqual(["confirmation calls: read failed"]);
    expect(builtRows().length).toBeGreaterThan(0);
    expect(updates).toHaveLength(0);
  });

  it("reports a digest failure in errors without hiding the other work", async () => {
    queueTomorrowDigest.mockResolvedValue({ status: "error", error: "boom" });

    const res = await POST(makeRequest("Bearer test-secret"));
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.digest).toBe("error");
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toMatch(/^digest:/);
  });
});
