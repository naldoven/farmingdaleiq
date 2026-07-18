import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T2 (audit iter 1, HIGH idempotency): createTask had no double-submit guard,
 * unlike claimTask/completeTask. A retry / double-tap created duplicate tasks.
 * The fix threads a client-generated request_id, backed by the unique partial
 * index tasks_request_id_uq (supabase/migrations/
 * 20260718000400_tasks_request_id.sql): a second insert with the same id fails
 * with 23505, which createTask absorbs by returning the first task's id.
 *
 * No app/(app)/tasks/actions.test.ts existed; the Supabase client is mocked as a
 * minimal thenable query builder (same approach as
 * app/(app)/waste/actions.test.ts): each awaited `.from(...)` chain resolves to
 * the next entry in a per-test response queue, whatever chained methods it used.
 */

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: vi.fn(async () => undefined),
  hasPermission: vi.fn(async () => true),
  PermissionError: class PermissionError extends Error {},
}));

// createTask only emits when a task is assigned; the pool tasks used here don't,
// but mock the bus so nothing reaches the real event pipeline.
vi.mock("@/lib/events/bus", () => ({
  emitEvent: vi.fn(async () => undefined),
}));

const createClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClientMock(),
}));

interface FakeResponse {
  data?: unknown;
  error?: { message: string; code?: string } | null;
}

function makeSupabaseMock(responses: FakeResponse[]) {
  let call = 0;
  const next = (): FakeResponse => {
    const response = responses[call] ?? { data: null, error: null };
    call += 1;
    return response;
  };

  const builder: PromiseLike<FakeResponse> & Record<string, unknown> = {
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    delete: () => builder,
    eq: () => builder,
    neq: () => builder,
    is: () => builder,
    single: () => builder,
    maybeSingle: () => builder,
    then(onFulfilled, onRejected) {
      return Promise.resolve(next()).then(onFulfilled, onRejected);
    },
  };

  return {
    from: vi.fn(() => builder),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
  };
}

const REQ_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REQ_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TODAY = "2026-07-18";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createTask idempotency (request_id dedup)", () => {
  it("a retry with the same request id returns the first task, not a duplicate", async () => {
    const { createTask } = await import("@/app/(app)/tasks/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([
        { data: { id: "task-1" }, error: null }, // first insert succeeds
        { data: null, error: { message: "duplicate key", code: "23505" } }, // retry hits the unique index
        { data: { id: "task-1" }, error: null }, // dedup lookup by request_id
      ]),
    );

    const first = await createTask({ title: "Prep", date: TODAY, requestId: REQ_A });
    const second = await createTask({ title: "Prep", date: TODAY, requestId: REQ_A });

    expect(first).toEqual({ ok: true, data: { id: "task-1" } });
    // The retry does not error on the unique-index collision; it resolves to the
    // already-created task.
    expect(second).toEqual({ ok: true, data: { id: "task-1" } });
  });

  it("different request ids create two distinct tasks", async () => {
    const { createTask } = await import("@/app/(app)/tasks/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([
        { data: { id: "task-1" }, error: null },
        { data: { id: "task-2" }, error: null },
      ]),
    );

    const first = await createTask({ title: "Prep", date: TODAY, requestId: REQ_A });
    const second = await createTask({ title: "Prep", date: TODAY, requestId: REQ_B });

    expect(first).toEqual({ ok: true, data: { id: "task-1" } });
    expect(second).toEqual({ ok: true, data: { id: "task-2" } });
  });

  it("falls back to current behavior when no request id is supplied", async () => {
    const { createTask } = await import("@/app/(app)/tasks/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([{ data: { id: "task-1" }, error: null }]),
    );

    const result = await createTask({ title: "Prep", date: TODAY });

    expect(result).toEqual({ ok: true, data: { id: "task-1" } });
  });

  it("still surfaces a non-idempotency insert error", async () => {
    const { createTask } = await import("@/app/(app)/tasks/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([{ data: null, error: { message: "boom" } }]),
    );

    const result = await createTask({ title: "Prep", date: TODAY, requestId: REQ_A });

    expect(result).toEqual({ ok: false, error: "boom" });
  });
});
