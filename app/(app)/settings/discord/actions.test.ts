import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers two audit fixes in the Discord settings actions:
 *   F-SET-1: a ZodError must surface as a friendly single line, never the raw
 *            JSON issues array `error.message` produces.
 *   F-SET-2: deleting a channel must unlink AND disable the routes that pointed
 *            at it, so an orphaned route can't silently reactivate later.
 *
 * The Supabase clients are mocked as a minimal chainable/thenable builder (same
 * approach as waste/actions.test.ts); `update()` payloads are captured so the
 * disable-on-delete behavior is directly assertable.
 */

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: vi.fn(async () => undefined),
  PermissionError: class PermissionError extends Error {},
}));

vi.mock("@/lib/discord/outbox", () => ({
  enqueueDiscordMessage: vi.fn(async () => undefined),
  deliverPendingOutbox: vi.fn(async () => ({ delivered: 0 })),
}));

const updateCalls: unknown[] = [];

function makeSupabaseMock() {
  const builder: PromiseLike<{ data: unknown; error: null }> & Record<string, unknown> = {
    select: () => builder,
    insert: () => builder,
    update: (payload: unknown) => {
      updateCalls.push(payload);
      return builder;
    },
    delete: () => builder,
    upsert: () => builder,
    eq: () => builder,
    order: () => builder,
    then(onFulfilled, onRejected) {
      return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
    },
  };
  return { from: vi.fn(() => builder) };
}

const supabaseMock = makeSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => supabaseMock,
  createClient: async () => supabaseMock,
}));

import { createChannel, deleteChannel } from "./actions";

beforeEach(() => {
  updateCalls.length = 0;
  vi.clearAllMocks();
});

describe("toActionError via createChannel (F-SET-1)", () => {
  it("returns a friendly, joined message for invalid input instead of raw Zod JSON", async () => {
    const result = await createChannel({ name: "", webhookUrl: "not-a-url" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Raw ZodError.message is a JSON array string starting with "[".
    expect(result.error.startsWith("[")).toBe(false);
    expect(result.error).not.toContain('"code"');
    expect(result.error).toContain("Name is required");
  });
});

describe("deleteChannel (F-SET-2)", () => {
  it("unlinks AND disables routes pointing at the deleted channel", async () => {
    const result = await deleteChannel({ id: "123e4567-e89b-42d3-a456-426614174000" });

    expect(result.ok).toBe(true);
    expect(updateCalls).toContainEqual({ channel_id: null, enabled: false });
  });
});
