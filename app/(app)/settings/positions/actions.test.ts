import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers the delete guard wiring and the default-list gate in the positions
 * server actions. The Supabase client is a table-aware fake: each case states
 * what a table returns for a select (and for an insert), and records the rpc
 * and insert calls so a test can prove the destructive call did or did not run.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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
  count?: number | null;
  error?: { message: string; code?: string } | null;
}

/** Keys are "table" (any operation) or "table.select" / "table.insert" for one operation. */
function makeSupabase(
  responses: Record<string, FakeResponse>,
  rpcResult: { error: { message: string; code?: string } | null } = { error: null },
) {
  const inserts: { table: string; rows: unknown }[] = [];
  const from = vi.fn((table: string) => {
    let op: "select" | "insert" | "update" | "delete" | null = null;
    const start = (next: "select" | "insert" | "update" | "delete") => {
      if (op === null) op = next;
      return builder;
    };
    const builder: PromiseLike<FakeResponse> & Record<string, unknown> = {
      select: () => start("select"),
      insert: (rows: unknown) => {
        inserts.push({ table, rows });
        return start("insert");
      },
      update: () => start("update"),
      delete: () => start("delete"),
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      single: () => builder,
      maybeSingle: () => builder,
      then(onFulfilled, onRejected) {
        const response = responses[`${table}.${op}`] ?? responses[table] ?? { data: null, count: 0 };
        return Promise.resolve({ error: null, ...response }).then(onFulfilled, onRejected);
      },
    };
    return builder;
  });
  const rpc = vi.fn(async () => rpcResult);
  return { from, rpc, inserts };
}

const POSITION_ID = "11111111-1111-4111-8111-111111111111";
const GROUP_ID = "22222222-2222-4222-8222-222222222222";

const NO_HISTORY: Record<string, FakeResponse> = {
  position_ratings: { count: 0 },
  passports: { data: [{ id: "pass1" }] },
  passport_enrollments: { count: 0 },
  passport_item_progress: { count: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deletePosition", () => {
  it("refuses when the position has ratings and never calls the delete RPC", async () => {
    const { deletePosition } = await import("@/app/(app)/settings/positions/actions");
    const supabase = makeSupabase({
      ...NO_HISTORY,
      positions: { data: { id: POSITION_ID, name: "Register 1" } },
      position_ratings: { count: 6 },
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await deletePosition({ id: POSITION_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('"Register 1"');
      expect(result.error).toContain("6 ratings");
      expect(result.error).toContain("Ratings matrix");
    }
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("refuses when trainees have started the position's passport", async () => {
    const { deletePosition } = await import("@/app/(app)/settings/positions/actions");
    const supabase = makeSupabase({
      ...NO_HISTORY,
      positions: { data: { id: POSITION_ID, name: "Breading" } },
      passport_enrollments: { count: 2 },
      passport_item_progress: { count: 14 },
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await deletePosition({ id: POSITION_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("2 trainee passport enrollments");
      expect(result.error).toContain("14 passport item records");
    }
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("runs the delete RPC when the position has no history", async () => {
    const { deletePosition } = await import("@/app/(app)/settings/positions/actions");
    const supabase = makeSupabase({ ...NO_HISTORY, positions: { data: { id: POSITION_ID, name: "Curbside" } } });
    createClientMock.mockResolvedValue(supabase);

    const result = await deletePosition({ id: POSITION_ID });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(supabase.rpc).toHaveBeenCalledWith("delete_position", { p_position_id: POSITION_ID });
  });

  it("does not delete when the history lookup fails", async () => {
    const { deletePosition } = await import("@/app/(app)/settings/positions/actions");
    const supabase = makeSupabase({
      ...NO_HISTORY,
      positions: { data: { id: POSITION_ID, name: "Curbside" } },
      position_ratings: { count: null, error: { message: "boom" } },
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await deletePosition({ id: POSITION_ID });

    expect(result.ok).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("treats a position that is already gone as done", async () => {
    const { deletePosition } = await import("@/app/(app)/settings/positions/actions");
    const supabase = makeSupabase({ positions: { data: null } });
    createClientMock.mockResolvedValue(supabase);

    expect(await deletePosition({ id: POSITION_ID })).toEqual({ ok: true, data: undefined });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("names a checklist or task as the blocker when the database refuses on a foreign key", async () => {
    const { deletePosition } = await import("@/app/(app)/settings/positions/actions");
    const supabase = makeSupabase(
      { ...NO_HISTORY, positions: { data: { id: POSITION_ID, name: "Curbside" } } },
      { error: { message: "violates foreign key constraint", code: "23503" } },
    );
    createClientMock.mockResolvedValue(supabase);

    const result = await deletePosition({ id: POSITION_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/checklist/);
      expect(result.error).toMatch(/task/);
      expect(result.error).not.toMatch(/^This position is still used by a training roadmap or session/);
    }
  });
});

describe("deletePositionGroup", () => {
  it("refuses when any position in the group has history and never calls the RPC", async () => {
    const { deletePositionGroup } = await import("@/app/(app)/settings/positions/actions");
    const supabase = makeSupabase({
      ...NO_HISTORY,
      position_groups: { data: { id: GROUP_ID, name: "Kitchen" } },
      positions: { data: [{ id: "p1" }, { id: "p2" }] },
      passport_item_progress: { count: 1 },
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await deletePositionGroup({ id: GROUP_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('group "Kitchen"');
      expect(result.error).toContain("1 passport item record");
    }
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("runs the group delete RPC when no position in it has history", async () => {
    const { deletePositionGroup } = await import("@/app/(app)/settings/positions/actions");
    const supabase = makeSupabase({
      ...NO_HISTORY,
      position_groups: { data: { id: GROUP_ID, name: "Kitchen" } },
      positions: { data: [{ id: "p1" }, { id: "p2" }] },
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await deletePositionGroup({ id: GROUP_ID });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(supabase.rpc).toHaveBeenCalledWith("delete_position_group", { p_group_id: GROUP_ID });
  });

  it("runs the group delete RPC for an empty group", async () => {
    const { deletePositionGroup } = await import("@/app/(app)/settings/positions/actions");
    const supabase = makeSupabase({
      position_groups: { data: { id: GROUP_ID, name: "Empty" } },
      positions: { data: [] },
    });
    createClientMock.mockResolvedValue(supabase);

    expect(await deletePositionGroup({ id: GROUP_ID })).toEqual({ ok: true, data: undefined });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("seedDefaultPositions", () => {
  it("adds nothing once any position exists, even if the seed group names were renamed", async () => {
    const { seedDefaultPositions } = await import("@/app/(app)/settings/positions/actions");
    const supabase = makeSupabase({
      "positions.select": { count: 3 },
      "position_groups.select": { data: [{ id: "g1", name: "Counter (renamed)" }] },
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await seedDefaultPositions();

    expect(result).toEqual({ ok: true, data: { inserted: 0 } });
    expect(supabase.inserts).toEqual([]);
  });

  it("loads all 19 default positions into an empty store", async () => {
    const { seedDefaultPositions } = await import("@/app/(app)/settings/positions/actions");
    const supabase = makeSupabase({
      "positions.select": { count: 0 },
      "position_groups.select": { data: [] },
      "position_groups.insert": { data: { id: "new-group" } },
      "positions.insert": {},
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await seedDefaultPositions();

    expect(result).toEqual({ ok: true, data: { inserted: 19 } });
    expect(supabase.inserts.filter((i) => i.table === "position_groups")).toHaveLength(5);
  });

  it("reuses a seed-named group that survived with no positions instead of duplicating it", async () => {
    const { seedDefaultPositions } = await import("@/app/(app)/settings/positions/actions");
    const supabase = makeSupabase({
      "positions.select": { count: 0 },
      "position_groups.select": { data: [{ id: "kept", name: "Front Counter" }] },
      "position_groups.insert": { data: { id: "new-group" } },
      "positions.insert": {},
    });
    createClientMock.mockResolvedValue(supabase);

    await seedDefaultPositions();

    expect(supabase.inserts.filter((i) => i.table === "position_groups")).toHaveLength(4);
  });
});
