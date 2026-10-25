import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-side guards on the /setups actions (app/(app)/setups/actions.ts),
 * added in the 2026-10 release-readiness pass (docs/SETUPS-RELEASE-READINESS.md).
 * actions.test.ts next door covers the setup_posted payload contract; this file
 * covers the one guard the board UI alone used to enforce: Top Performer must
 * be someone assigned to the setup, because the event mints tokens.
 */

const SETUP_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const LEADER_ID = "33333333-3333-4333-8333-333333333333";

type Response = { data: unknown; error: { message: string } | null };

function createFakeClient(responses: Record<string, Response[]>, rpcResult: unknown) {
  return {
    from(table: string) {
      const queue = responses[table];
      if (!queue || queue.length === 0) throw new Error(`no mock response queued for table "${table}"`);
      const response = queue.shift()!;
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.limit = chain;
      builder.maybeSingle = async () => response;
      builder.single = async () => response;
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject);
      return builder;
    },
    rpc: async () => ({ data: rpcResult, error: null }),
    auth: { getUser: async () => ({ data: { user: { id: LEADER_ID } } }) },
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
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => client,
  createServiceRoleClient: () => client,
}));

import { selectTopPerformer } from "./actions";

beforeEach(() => {
  requirePermissionMock.mockClear();
  emitEventMock.mockClear();
});

describe("selectTopPerformer", () => {
  it("refuses a pick who is not assigned to the setup and emits nothing", async () => {
    client = createFakeClient({ setup_assignments: [{ data: null, error: null }] }, false);

    const result = await selectTopPerformer({ setupId: SETUP_ID, userId: USER_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("assigned to this setup");
    expect(emitEventMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).toHaveBeenCalledWith("setups.post");
  });

  it("emits top_performer for an assigned pick, recording who selected them", async () => {
    client = createFakeClient({ setup_assignments: [{ data: { id: "a-1" }, error: null }] }, false);

    const result = await selectTopPerformer({ setupId: SETUP_ID, userId: USER_ID });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(emitEventMock).toHaveBeenCalledWith("top_performer", {
      setup_id: SETUP_ID,
      user_id: USER_ID,
      selected_by: LEADER_ID,
    });
  });

  it("refuses a second pick for the same shift before checking assignments", async () => {
    client = createFakeClient({}, true);

    const result = await selectTopPerformer({ setupId: SETUP_ID, userId: USER_ID });

    expect(result.ok).toBe(false);
    expect(emitEventMock).not.toHaveBeenCalled();
  });
});
