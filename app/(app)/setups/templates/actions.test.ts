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
import { createLayout, deletePosition, deletePositionGroup } from "./actions";

const mockRequirePermission = vi.mocked(requirePermission);
const mockCreateClient = vi.mocked(createClient);

function makeQueryResult(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.insert = vi.fn(chain);
  builder.eq = vi.fn(chain);
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
