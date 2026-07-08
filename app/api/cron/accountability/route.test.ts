import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Coverage for the Accountability nightly sweep cron route (fills the "no
 * test coverage for actions, queries, or cron" gap in
 * docs/KITCHENIQ-PARITY-AUDIT.md). Exercises both the auth guard and the
 * expiry sweep's actual DB-shaped flow (fake service-role client), since
 * shouldExpirePendingAction/computeActivePoints already have pure-logic unit
 * tests in app/(app)/accountability/logic.test.ts.
 */

type Response = { data: unknown; error: { message: string } | null };

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
      builder.update = chain;
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject);
      return builder;
    },
  };
}

let fakeAdmin: ReturnType<typeof createFakeAdmin>;

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => fakeAdmin,
}));

import { GET, POST } from "./route";

function makeRequest(authHeader?: string): NextRequest {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new NextRequest("https://example.test/api/cron/accountability", { headers });
}

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
});

describe("accountability cron route", () => {
  it("rejects a request with no CRON_SECRET configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest("Bearer whatever"));
    expect(res.status).toBe(401);
  });

  it("rejects a request with the wrong bearer token", async () => {
    const res = await GET(makeRequest("Bearer nope"));
    expect(res.status).toBe(401);
  });

  it("rejects a request with no authorization header", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("expires a pending action once active points have decayed below its threshold, and leaves others alone", async () => {
    fakeAdmin = createFakeAdmin({
      disciplinary_actions: [
        {
          data: [
            { id: "action-decayed", user_id: "user-1", type_id: "coaching", status: "pending" },
            { id: "action-still-over", user_id: "user-2", type_id: "written", status: "pending" },
          ],
          error: null,
        },
        { data: null, error: null }, // the one update() call below
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
      infractions: [
        { data: [{ points: 5, expires_at: null }], error: null }, // user-1: decayed to 5
        { data: [{ points: 25, expires_at: null }], error: null }, // user-2: still 25
      ],
    });

    const res = await POST(makeRequest("Bearer test-secret"));
    const body = (await res.json()) as { ok: boolean; checked: number; expired: number };

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, checked: 2, expired: 1 });
  });

  it("checks nothing and expires nothing when there are no pending actions", async () => {
    fakeAdmin = createFakeAdmin({
      disciplinary_actions: [{ data: [], error: null }],
      disciplinary_action_types: [{ data: [], error: null }],
    });

    const res = await GET(makeRequest("Bearer test-secret"));
    const body = (await res.json()) as { ok: boolean; checked: number; expired: number };

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, checked: 0, expired: 0 });
  });
});
