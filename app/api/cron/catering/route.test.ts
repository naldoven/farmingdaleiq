import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type QueryResponse = { data: unknown; error: { message: string } | null };

let queryResponse: QueryResponse;
let setupQueryResponse: QueryResponse;
let updateResponse: QueryResponse;
const updates: Array<{ values: Record<string, unknown>; filters: Array<[string, string]> }> = [];
const events: Array<Record<string, unknown>> = [];

function createFakeAdmin() {
  return {
    from(table: string) {
      if (table === "catering_orders") {
        const filters: Array<[string, string]> = [];
        const query: Record<string, unknown> = {};
        let selectsSetupCandidates = false;
        const chain = () => query;
        query.select = (columns: string) => {
          selectsSetupCandidates = columns.includes("setup_generated_at");
          return query;
        };
        query.eq = (column: string, value: string) => {
          filters.push([column, value]);
          return query;
        };
        query.in = chain;
        query.neq = chain;
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
          update.select = () => Promise.resolve(updateResponse);
          return update;
        };
        return query;
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

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
  queryResponse = { data: [], error: null };
  setupQueryResponse = { data: [], error: null };
  updateResponse = { data: [], error: null };
  updates.length = 0;
  events.length = 0;
  vi.useFakeTimers();
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
});
