import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers the admin CRUD guards. The duplicate-name rules are also enforced by
 * unique indexes at the DB level (supabase/migrations/20260707100006_waste_
 * name_unique.sql, plus the uncategorized partial index in 20260801000000_
 * waste_hardening.sql); these tests pin the APP-side behavior that produces the
 * friendly message before the DB ever rejects the write, and in particular that
 * item names are scoped PER CATEGORY exactly as the index is.
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
  error?: { message: string; code?: string } | null;
  /** For `.select(..., { count: "exact", head: true })` reads. */
  count?: number | null;
}

/**
 * Builds a fake Supabase client whose `.from(table)` always returns the same
 * chainable, thenable builder. Each *top-level* `await supabase.from(...)...`
 * expression consumes exactly one entry from `responses`, in order -- however
 * many chained methods (select/insert/update/eq/single) it used to get there.
 */
function makeSupabaseMock(
  responses: FakeResponse[],
  user: { id: string } | null = { id: "user-1" },
) {
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
    maybeSingle: () => builder,
    then(onFulfilled, onRejected) {
      return Promise.resolve(next()).then(onFulfilled, onRejected);
    },
  };

  return {
    from: vi.fn(() => builder),
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
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
        { data: [{ id: "11111111-1111-4111-8111-111111111111" }], error: null }, // update, returning the affected row
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

    expect(result).toEqual({
      ok: false,
      error: "An item with this name already exists in this category.",
    });
  });

  it("allows updating an item without changing its name", async () => {
    const { updateItem } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([
        { data: [{ id: "33333333-3333-4333-8333-333333333333", name: "Chicken Breast" }] }, // duplicate check
        { data: { name: "Chicken Breast", unit: "lb", unit_cost: 2.5 } }, // previous row, for the audit event
        { data: [{ id: "33333333-3333-4333-8333-333333333333" }], error: null }, // update, returning the affected row
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

describe("createItem name scoping (matches the per-category unique index)", () => {
  it("allows the same item name in a different category", async () => {
    const { createItem } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([
        {
          // "Fries" already exists, but under a DIFFERENT category. The DB
          // index is (category_id, lower(name)), so this is legal; the old
          // store-wide app check rejected it and was stricter than the schema.
          data: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              name: "Fries",
              category_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            },
          ],
        },
        { data: { id: "44444444-4444-4444-8444-444444444444" }, error: null }, // insert
      ]),
    );

    const result = await createItem({
      name: "Fries",
      categoryId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      unit: "each",
    });

    expect(result).toEqual({ ok: true, data: { id: "44444444-4444-4444-8444-444444444444" } });
  });

  it("still rejects the same name within the same category", async () => {
    const { createItem } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([
        {
          data: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              name: "Fries",
              category_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            },
          ],
        },
      ]),
    );

    const result = await createItem({
      name: "fries",
      categoryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      unit: "each",
    });

    expect(result).toEqual({
      ok: false,
      error: "An item with this name already exists in this category.",
    });
  });
});

describe("deleteCategory refuses to destroy a non-empty category", () => {
  it("reports the item count instead of cascade-deleting them", async () => {
    const { deleteCategory } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(makeSupabaseMock([{ count: 3, error: null }]));

    const result = await deleteCategory({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });

    expect(result).toEqual({
      ok: false,
      error: "This category still has 3 items. Move or delete them first.",
    });
  });

  it("uses the singular for exactly one item", async () => {
    const { deleteCategory } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(makeSupabaseMock([{ count: 1, error: null }]));

    const result = await deleteCategory({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });

    expect(result).toEqual({
      ok: false,
      error: "This category still has 1 item. Move or delete them first.",
    });
  });

  it("deletes an empty category", async () => {
    const { deleteCategory } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([
        { count: 0, error: null }, // item count
        { data: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }], error: null }, // delete, returning the row
      ]),
    );

    const result = await deleteCategory({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });

    expect(result).toEqual({ ok: true, data: undefined });
  });
});

describe("logWasteEntry attribution", () => {
  it("refuses to write an unattributed entry when the session has lapsed", async () => {
    const { logWasteEntry } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(makeSupabaseMock([], null));

    const result = await logWasteEntry({
      itemId: "33333333-3333-4333-8333-333333333333",
      quantity: 1,
    });

    expect(result).toEqual({
      ok: false,
      error: "Your session expired. Sign in again to log waste.",
    });
  });
});

describe("DB errors are not leaked verbatim", () => {
  it("maps a unique-violation to a friendly message", async () => {
    const { updateCategory } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([
        { data: [] }, // duplicate check finds nothing (lost the race)
        {
          data: null,
          error: {
            code: "23505",
            message:
              'duplicate key value violates unique constraint "waste_categories_name_lower_uq"',
          },
        },
      ]),
    );

    const result = await updateCategory({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Produce",
      sort: 0,
    });

    expect(result).toEqual({ ok: false, error: "That name is already taken. Try a different one." });
  });
});

describe("writes filtered to zero rows by RLS are reported as failures", () => {
  it("does not claim success when an update affects no rows", async () => {
    const { updateCategory } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([
        { data: [] }, // duplicate check
        { data: [], error: null }, // update matched nothing (RLS filtered it out)
      ]),
    );

    const result = await updateCategory({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Produce",
      sort: 0,
    });

    expect(result).toEqual({ ok: false, error: "That category no longer exists." });
  });

  it("does not claim success when a delete removes no rows", async () => {
    const { deleteItem } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(makeSupabaseMock([{ data: [], error: null }]));

    const result = await deleteItem({ id: "33333333-3333-4333-8333-333333333333" });

    expect(result).toEqual({ ok: false, error: "That item no longer exists." });
  });
});

describe("deleteWasteEntry", () => {
  it("snapshots the entry, deletes it, and reports a missing row honestly", async () => {
    const { deleteWasteEntry } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([
        { data: null }, // snapshot read: entry already gone
        { data: [], error: null }, // delete matched nothing
      ]),
    );

    const result = await deleteWasteEntry({ id: "55555555-5555-4555-8555-555555555555" });

    expect(result).toEqual({ ok: false, error: "That entry no longer exists." });
  });

  it("succeeds when the entry existed", async () => {
    const { deleteWasteEntry } = await import("@/app/(app)/waste/actions");
    createClientMock.mockReturnValue(
      makeSupabaseMock([
        {
          data: {
            id: "55555555-5555-4555-8555-555555555555",
            item_id: "33333333-3333-4333-8333-333333333333",
            quantity: 2,
            logged_by: "user-1",
            logged_at: "2026-08-01T18:00:00.000Z",
          },
        }, // snapshot
        { data: [{ id: "55555555-5555-4555-8555-555555555555" }], error: null }, // delete
      ]),
    );

    const result = await deleteWasteEntry({ id: "55555555-5555-4555-8555-555555555555" });

    expect(result).toEqual({ ok: true, data: undefined });
  });
});
