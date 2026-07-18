import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TR2 (self-approval) coverage: a person may never countersign (signItem) or
 * stamp (stampPassport) their OWN passport, even with training.stamp. The UI
 * hides self-approval, but a direct action call must be rejected server-side —
 * the leadership-passport variant would otherwise let a trainer self-upgrade
 * their own role. These fake the Supabase client to drive the real actions.
 */

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const ENROLLMENT_ID = "33333333-3333-4333-8333-333333333333";
const ITEM_ID = "44444444-4444-4444-8444-444444444444";

type Response = { data: unknown; error: { message: string } | null };

function createFakeClient(responses: Record<string, Response[]>, actorId: string | null = ACTOR_ID) {
  const calls: string[] = [];
  return {
    calls,
    from(table: string) {
      calls.push(table);
      const queue = responses[table];
      if (!queue || queue.length === 0) {
        throw new Error(`no mock response queued for table "${table}"`);
      }
      const response = queue.shift()!;
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const m of ["select", "eq", "neq", "in", "is", "order", "limit", "insert", "update", "delete"]) {
        builder[m] = chain;
      }
      builder.maybeSingle = async () => response;
      builder.single = async () => response;
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(response).then(resolve, reject);
      return builder;
    },
    auth: {
      getUser: async () => ({ data: { user: actorId ? { id: actorId } : null } }),
    },
  };
}

let client: ReturnType<typeof createFakeClient>;
const emitEventMock = vi.fn(async (key: string, payload?: Record<string, unknown>) => {
  void key;
  void payload;
  return undefined;
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    requirePermission: vi.fn(async () => undefined),
    hasPermission: vi.fn(async () => true),
  };
});

vi.mock("@/lib/events/bus", () => ({
  emitEvent: (key: string, payload: Record<string, unknown>) => emitEventMock(key, payload),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => client,
}));

import { signItem, stampPassport } from "./actions";

beforeEach(() => {
  emitEventMock.mockClear();
});

describe("signItem self-approval (TR2)", () => {
  it("rejects countersigning your own passport item", async () => {
    client = createFakeClient({
      passport_enrollments: [{ data: { user_id: ACTOR_ID }, error: null }],
    });

    const result = await signItem({ enrollmentId: ENROLLMENT_ID, itemId: ITEM_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/your own/i);
    // Rejected before writing any progress row.
    expect(client.calls).not.toContain("passport_item_progress");
  });

  it("allows countersigning someone else's passport item", async () => {
    client = createFakeClient({
      passport_enrollments: [{ data: { user_id: OTHER_ID }, error: null }],
      passport_item_progress: [
        { data: null, error: null }, // no existing progress row
        { data: null, error: null }, // insert
      ],
    });

    const result = await signItem({ enrollmentId: ENROLLMENT_ID, itemId: ITEM_ID });

    expect(result.ok).toBe(true);
    expect(client.calls).toContain("passport_item_progress");
  });
});

describe("stampPassport self-approval (TR2)", () => {
  it("rejects stamping your own passport (would self-upgrade the actor's role)", async () => {
    client = createFakeClient({
      passport_enrollments: [
        { data: { id: ENROLLMENT_ID, user_id: ACTOR_ID, passport_id: "p-1", stamped_at: null }, error: null },
      ],
    });

    const result = await stampPassport({ enrollmentId: ENROLLMENT_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/your own/i);
    // Rejected before ever loading the passport / running the stamp side effects.
    expect(client.calls).not.toContain("passports");
    expect(emitEventMock).not.toHaveBeenCalled();
  });
});
