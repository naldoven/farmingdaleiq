import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integration-style coverage for the Team Feed server actions
 * (app/(app)/team/actions.ts). Focus: FEED-RECOGNITION -- createRecognition
 * credited tokens through the per-request user client, so the ledger insert's
 * `.insert(...).select("id").single()` RETURNING read-back failed the
 * token_transactions SELECT policy for a non-manager award-holder (Team Leader
 * / Shift Supervisor) crediting SOMEONE ELSE, and Postgres rolled the whole
 * award back -- the recognition silently produced no feed post. Same class as
 * the fixed ACC1 infraction-insert bug. These tests fake the two Supabase
 * clients so they can assert WHICH client (per-request vs. service-role) the
 * award insert actually runs against.
 */

const AUTHOR_ID = "11111111-1111-4111-8111-111111111111";
const SUBJECT_ID = "22222222-2222-4222-8222-222222222222";

type Response = { data: unknown; error: { message: string; code?: string } | null };

/**
 * Minimal fake PostgREST query builder: chain calls (select/eq/order/limit/
 * insert/maybeSingle/single/await) are no-ops that return the same builder,
 * and the query resolves to the next canned response queued for that table.
 */
function createFakeClient(
  responses: Record<string, Response[]>,
  recordCalls?: (table: string) => void,
  authUserId: string | null = AUTHOR_ID,
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
// transform, so actions.ts picks up the mocked modules. awardTokens itself is
// deliberately NOT mocked -- the real ledger code runs against whichever fake
// client createRecognition hands it, which is exactly what these tests assert.
import { createRecognition } from "./actions";

beforeEach(() => {
  requirePermissionMock.mockClear();
  requirePermissionMock.mockImplementation(async () => undefined);
  emitEventMock.mockClear();
  perRequestTableCalls.length = 0;
  serviceRoleTableCalls.length = 0;
});

describe("createRecognition", () => {
  it("rejects self-recognition before touching either client", async () => {
    perRequestClient = createFakeClient({}, (t) => perRequestTableCalls.push(t), AUTHOR_ID);
    serviceRoleClient = createFakeClient({}, (t) => serviceRoleTableCalls.push(t));

    const result = await createRecognition({
      subjectUserId: AUTHOR_ID,
      amount: 10,
      body: "Nice work.",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/yourself/i);
    }
    // No ledger write and no feed post for a self-recognition.
    expect(perRequestTableCalls).toEqual([]);
    expect(serviceRoleTableCalls).toEqual([]);
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it(
    "awards through the service-role client (a non-manager award-holder's RETURNING " +
      "read isn't blocked by RLS) and creates the feed post on the per-request client",
    async () => {
      // FEED-RECOGNITION: the per-request client is intentionally given NO
      // `token_transactions` response. If createRecognition regresses to
      // awarding on the per-request `supabase` client instead of the
      // service-role one, this test fails loudly (no response queued) -- which
      // mirrors production, where a Team-Leader/Shift-Supervisor award-holder
      // has no SELECT policy on a row crediting someone else, so the insert's
      // RETURNING read fails under RLS and the whole award rolls back.
      perRequestClient = createFakeClient(
        {
          feed_posts: [{ data: { id: "new-post-id" }, error: null }],
        },
        (t) => perRequestTableCalls.push(t),
        AUTHOR_ID,
      );

      serviceRoleClient = createFakeClient(
        {
          token_transactions: [
            { data: { id: "tx-id" }, error: null }, // insert().select("id").single()
            { data: [{ delta: 15 }], error: null }, // getBalance sum-of-deltas
          ],
        },
        (t) => serviceRoleTableCalls.push(t),
      );

      const result = await createRecognition({
        subjectUserId: SUBJECT_ID,
        amount: 15,
        body: "Owned the lunch rush.",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.postId).toBe("new-post-id");
      }
      // The token credit ran on the service-role client, never the per-request
      // one -- that's the fix for the dead recognition path.
      expect(serviceRoleTableCalls).toContain("token_transactions");
      expect(perRequestTableCalls).not.toContain("token_transactions");
      // The feed post is still created on the per-request client (its RLS
      // insert policy already permits a tokens.award holder).
      expect(perRequestTableCalls).toContain("feed_posts");
      // The award stays gated behind requirePermission("tokens.award") -- no
      // new self-mint hole.
      expect(requirePermissionMock).toHaveBeenCalledWith("tokens.award");
      expect(emitEventMock).toHaveBeenCalledWith(
        "recognition",
        expect.objectContaining({
          post_id: "new-post-id",
          actor_id: AUTHOR_ID,
          user_id: SUBJECT_ID,
          amount: 15,
        }),
      );
    },
  );
});
