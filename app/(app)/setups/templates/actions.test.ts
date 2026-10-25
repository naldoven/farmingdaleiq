import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SETB3 + SETB6 action coverage.
 *
 * SETB3: deletePosition / deletePositionGroup used to run a bare
 * `positions.delete()` that ALWAYS failed on passports_position_id_fkey (every
 * position auto-gets a Position Passport). They now call SECURITY DEFINER RPCs
 * that clear the dependents first; a still-blocked delete (Postgres 23503)
 * surfaces a friendly message instead of the raw `..._fkey` string.
 *
 * SETB6: a brand-new store layout must be created inactive so it doesn't
 * instantly become the live posted board.
 */

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/permissions")>(
    "@/lib/auth/permissions",
  );
  return { ...actual, requirePermission: vi.fn() };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createLayout, deletePosition, deletePositionGroup, seedDefaultLayout } from "./actions";
import { SEED_DEFAULT_LAYOUT_NAME } from "./constants";

const mockRequirePermission = vi.mocked(requirePermission);
const mockCreateClient = vi.mocked(createClient);

function makeQueryResult(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.insert = vi.fn(chain);
  builder.upsert = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.single = vi.fn(async () => result);
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const POSITION_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermission.mockResolvedValue(undefined as never);
});

describe("createLayout (SETB6)", () => {
  it("creates the layout inactive so it does not go live immediately", async () => {
    const layoutBuilder = makeQueryResult({ data: { id: "L1" }, error: null });
    const fromMock = vi.fn(() => layoutBuilder);
    mockCreateClient.mockResolvedValue({ from: fromMock } as never);

    const result = await createLayout({ name: "Lunch board", dayPartId: null });

    expect(result).toEqual({ ok: true, data: { id: "L1" } });
    expect(fromMock).toHaveBeenCalledWith("store_layouts");
    expect(layoutBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Lunch board", active: false }),
    );
  });
});

describe("seedDefaultLayout", () => {
  it("inserts nothing when any layout already exists (idempotent)", async () => {
    const countBuilder = makeQueryResult({ data: null, error: null, count: 1 });
    const from = vi.fn(() => countBuilder);
    mockCreateClient.mockResolvedValue({ from } as never);

    const result = await seedDefaultLayout();

    expect(result).toEqual({ ok: true, data: { tiles: 0 } });
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("store_layouts");
    expect(mockRequirePermission).toHaveBeenCalledWith("setups.manage");
  });

  it("creates the default layout ACTIVE and places a tile per existing seed position", async () => {
    const countBuilder = makeQueryResult({ data: null, error: null, count: 0 });
    const positionsBuilder = makeQueryResult({
      data: [
        // The training-roadmap station comes back first from the database but
        // is not in a seeded setup group, so the setup "Register 1" must win.
        { id: "roadmap-reg1", name: "Register 1", sort: 20, position_groups: { name: "FOH" } },
        { id: "setup-reg1", name: "Register 1", sort: 0, position_groups: { name: "Front Counter" } },
        { id: "setup-dishes", name: "Dishes", sort: 0, position_groups: { name: "Back of House Support" } },
      ],
      error: null,
    });
    const layoutBuilder = makeQueryResult({ data: { id: "L1" }, error: null });
    const tilesBuilder = makeQueryResult({ data: null, error: null });
    const from = vi.fn((table: string) => {
      if (table === "positions") return positionsBuilder;
      if (table === "layout_tiles") return tilesBuilder;
      return from.mock.calls.filter((c) => c[0] === "store_layouts").length === 1 ? countBuilder : layoutBuilder;
    });
    mockCreateClient.mockResolvedValue({ from } as never);

    const result = await seedDefaultLayout();

    expect(result).toEqual({ ok: true, data: { tiles: 2 } });
    expect(layoutBuilder.insert).toHaveBeenCalledWith({
      name: SEED_DEFAULT_LAYOUT_NAME,
      day_part_id: null,
      active: true,
    });
    const [rows, options] = (tilesBuilder.upsert as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options).toEqual({ onConflict: "layout_id,position_id", ignoreDuplicates: true });
    const placed = rows.map((r: { position_id: string }) => r.position_id);
    expect(placed).toEqual(expect.arrayContaining(["setup-reg1", "setup-dishes"]));
    expect(placed).not.toContain("roadmap-reg1");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.layout_id).toBe("L1");
      expect(row.area_label).toBeNull();
    }
  });
});

describe("deletePosition (SETB3)", () => {
  it("deletes through the delete_position RPC (which clears the passport FK)", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    mockCreateClient.mockResolvedValue({ rpc } as never);

    const result = await deletePosition({ id: POSITION_ID });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenCalledWith("delete_position", { p_position_id: POSITION_ID });
  });

  it("maps a still-blocked delete (23503) to a friendly message, not the raw fkey error", async () => {
    const rpc = vi.fn(async () => ({
      error: { code: "23503", message: 'violates foreign key constraint "roadmap_stations_position_id_fkey"' },
    }));
    mockCreateClient.mockResolvedValue({ rpc } as never);

    const result = await deletePosition({ id: POSITION_ID });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain("fkey");
      expect(result.error).toMatch(/training/i);
    }
  });
});

describe("deletePositionGroup (SETB3)", () => {
  it("deletes through the delete_position_group RPC", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    mockCreateClient.mockResolvedValue({ rpc } as never);

    const result = await deletePositionGroup({ id: GROUP_ID });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenCalledWith("delete_position_group", { p_group_id: GROUP_ID });
  });
});
