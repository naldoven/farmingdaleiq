import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers the duplicate-name guard added to the admin CRUD actions (parity
 * audit "Waste" LOW: "No uniqueness check on category/item names"). There's
 * no unique constraint at the DB level (that's a schema change outside this
 * stream's owned files -- see the doc comment on findDuplicateNameId in
 * actions.ts), so this is the only place that behavior can be verified.
 *
 * No existing app/(app)/*\/actions.test.ts pattern exists in this repo to
 * follow (every module's server actions are untested -- itself one of the
 * audit's own findings), so the Supabase client is mocked here as a minimal
 * thenable query builder: whatever `.from()` chain is awaited resolves to
 * the next entry in a per-test response queue, regardless of which
 * chained methods (select/insert/update/eq/single) were called along the
 * way. That's enough to drive real branches in actions.ts without needing a
 * full PostgREST mock.
 */

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: vi.fn(async () => undefined),
  PermissionError: class PermissionError extends Error {},
}));

const createClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClientMock(),
}));

interface FakeResponse {
  data?: unknown;
  error?: { message: string } | null;
}

/**
 * Builds a fake Supabase client whose `.from(table)` always returns the same
 * chainable, thenable builder. Each *top-level* `await supabase.from(...)...`
 * expression consumes exactly one entry from `responses`, in order -- however
 * many chained methods (select/insert/update/eq/single) it used to get there.
 */
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
    single: () => builder,
    then(onFulfilled, onRejected) {
      return Promise.resolve(next()).then(onFulfilled, onRejected);
    },
  };

  return {
    from: vi.fn(() => builder),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCategory duplicate-name guard", () => {
  it("rejects a name that already exists, case-insensitively", async () => {
    const { createCategory } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([{ data: [{ id: "11111111-1111-4111-8111-111111111111", name: "Produce" }] }]),
    );

    const result = await createCategory({ name: "produce", sort: 0 });

    expect(result).toEqual({ ok: false, error: "A category with this name already exists." });
  });

  it("allows a genuinely new name", async () => {
    const { createCategory } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([
        { data: [{ id: "11111111-1111-4111-8111-111111111111", name: "Produce" }] }, // duplicate check
        { data: { id: "22222222-2222-4222-8222-222222222222" }, error: null }, // insert
      ]),
    );

    const result = await createCategory({ name: "Meat", sort: 0 });

    expect(result).toEqual({ ok: true, data: { id: "22222222-2222-4222-8222-222222222222" } });
  });
});

describe("updateCategory duplicate-name guard", () => {
  it("excludes the row's own id from the duplicate check", async () => {
    const { updateCategory } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([
        { data: [{ id: "11111111-1111-4111-8111-111111111111", name: "Produce" }] }, // only match is itself
        { data: null, error: null }, // update
      ]),
    );

    const result = await updateCategory({ id: "11111111-1111-4111-8111-111111111111", name: "Produce", sort: 1 });

    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("rejects renaming into another category's existing name", async () => {
    const { updateCategory } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([
        {
          data: [
            { id: "11111111-1111-4111-8111-111111111111", name: "Produce" },
            { id: "22222222-2222-4222-8222-222222222222", name: "Meat" },
          ],
        },
      ]),
    );

    const result = await updateCategory({ id: "11111111-1111-4111-8111-111111111111", name: "meat", sort: 0 });

    expect(result).toEqual({ ok: false, error: "A category with this name already exists." });
  });
});

describe("createItem / updateItem duplicate-name guard", () => {
  it("rejects a duplicate item name, case-insensitively", async () => {
    const { createItem } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([{ data: [{ id: "33333333-3333-4333-8333-333333333333", name: "Chicken Breast" }] }]),
    );

    const result = await createItem({ name: "chicken breast", unit: "lb" });

    expect(result).toEqual({ ok: false, error: "An item with this name already exists." });
  });

  it("allows updating an item without changing its name", async () => {
    const { updateItem } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([
        { data: [{ id: "33333333-3333-4333-8333-333333333333", name: "Chicken Breast" }] },
        { data: null, error: null },
      ]),
    );

    const result = await updateItem({
      id: "33333333-3333-4333-8333-333333333333",
      name: "Chicken Breast",
      unit: "lb",
      unitCost: 2.5,
    });

    expect(result).toEqual({ ok: true, data: undefined });
  });
});
