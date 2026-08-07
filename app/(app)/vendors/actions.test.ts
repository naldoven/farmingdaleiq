import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: vi.fn(async () => undefined),
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
    limit: () => builder,
    single: () => builder,
    then(onFulfilled, onRejected) {
      return Promise.resolve(next()).then(onFulfilled, onRejected);
    },
  };

  return {
    from: vi.fn(() => builder),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteVendor", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("blocks delete when equipment is attached", async () => {
    const { deleteVendor } = await import("@/app/(app)/vendors/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([
        { data: [{ id: "equipment-1" }], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ]),
    );

    const result = await deleteVendor({ id });

    expect(result).toEqual({
      ok: false,
      error: "This vendor is attached to old records. Deactivate it instead.",
    });
  });

  it("deletes an unlinked vendor", async () => {
    const { deleteVendor } = await import("@/app/(app)/vendors/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [{ id }], error: null },
      ]),
    );

    const result = await deleteVendor({ id });

    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("reports a foreign-key delete race as a deactivate message", async () => {
    const { deleteVendor } = await import("@/app/(app)/vendors/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        {
          data: null,
          error: { code: "23503", message: "violates foreign key constraint" },
        },
      ]),
    );

    const result = await deleteVendor({ id });

    expect(result).toEqual({
      ok: false,
      error: "This vendor is attached to old records. Deactivate it instead.",
    });
  });
});
