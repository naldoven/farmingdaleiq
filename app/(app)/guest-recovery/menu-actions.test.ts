import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/permissions")>("@/lib/auth/permissions");
  return { ...actual, requirePermission: vi.fn() };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { revalidatePath } from "next/cache";

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { addMenuItem, setMenuItemActive, setMenuItemMods } from "@/app/(app)/guest-recovery/menu-actions";

const mockRequirePermission = vi.mocked(requirePermission);
const mockCreateClient = vi.mocked(createClient);
const mockRevalidate = vi.mocked(revalidatePath);

const ITEM_ID = "33333333-3333-4333-8333-333333333333";
const DENIED = { ok: false, error: "You don't have permission to do this." };
const INPUT = { name: "Spicy Chicken Sandwich", family: "Spicy Chicken Sandwich", category: "Entrees" };

type Result = { data?: unknown; error?: { message: string; code?: string } | null };

/**
 * Chainable stand-in for the supabase-js builder. Each awaited query (or
 * maybeSingle) takes the next preset result, in the order the action runs them.
 */
function useClient(results: Result[]) {
  const queue = [...results];
  const calls: { method: string; args: unknown[] }[] = [];
  const next = () => Promise.resolve(queue.shift() ?? { data: null, error: null });
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit", "insert", "update"]) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });
  }
  builder.maybeSingle = vi.fn(next);
  builder.then = (resolve: (value: unknown) => unknown) => next().then(resolve);
  const from = vi.fn(() => builder);
  mockCreateClient.mockResolvedValue({ from } as never);
  return { from, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermission.mockResolvedValue(undefined);
});

describe("permission", () => {
  it("refuses a caller without guest_recovery.manage and never touches a table", async () => {
    mockRequirePermission.mockRejectedValue(new PermissionError("guest_recovery.manage"));
    const { from } = useClient([]);

    expect(await addMenuItem(INPUT)).toEqual(DENIED);
    expect(await setMenuItemActive({ id: ITEM_ID, active: false })).toEqual(DENIED);
    expect(mockRequirePermission).toHaveBeenCalledWith("guest_recovery.manage");
    expect(from).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});

describe("addMenuItem", () => {
  it("inserts at max sort + 1 and refreshes both pages", async () => {
    const { calls } = useClient([{ data: { sort: 41 }, error: null }, { error: null }]);

    expect(await addMenuItem({ ...INPUT, name: "  Fries  " })).toEqual({ ok: true, data: undefined });
    const insert = calls.find((c) => c.method === "insert")!;
    expect(insert.args[0]).toEqual({
      name: "Fries",
      family: INPUT.family,
      category: INPUT.category,
      sort: 42,
    });
    expect(mockRevalidate).toHaveBeenCalledWith("/guest-recovery/menu");
    expect(mockRevalidate).toHaveBeenCalledWith("/guest-recovery/new");
  });

  it("starts at sort 1 on an empty menu", async () => {
    const { calls } = useClient([{ data: null, error: null }, { error: null }]);
    await addMenuItem(INPUT);
    expect(calls.find((c) => c.method === "insert")!.args[0]).toMatchObject({ sort: 1 });
  });

  it("rejects bad input before any query", async () => {
    const { from } = useClient([]);
    const result = await addMenuItem({ ...INPUT, name: "   " });
    expect(result.ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it("says so when the name is already on the menu", async () => {
    useClient([
      { data: { sort: 1 }, error: null },
      { error: { message: "duplicate key", code: "23505" } },
      { data: { active: true }, error: null },
    ]);
    expect(await addMenuItem(INPUT)).toEqual({ ok: false, error: "That item is already on the menu" });
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it("points to the Show button when the twin is hidden", async () => {
    useClient([
      { data: { sort: 1 }, error: null },
      { error: { message: "duplicate key", code: "23505" } },
      { data: { active: false }, error: null },
    ]);
    expect(await addMenuItem(INPUT)).toEqual({
      ok: false,
      error: "That item is hidden. Turn it back on below.",
    });
  });

  it("surfaces any other insert error", async () => {
    useClient([{ data: null, error: null }, { error: { message: "nope", code: "42501" } }]);
    expect(await addMenuItem(INPUT)).toEqual({ ok: false, error: "nope" });
  });
});

describe("setMenuItemActive", () => {
  it("hides an item", async () => {
    const { calls } = useClient([{ data: [{ id: ITEM_ID }], error: null }]);
    expect(await setMenuItemActive({ id: ITEM_ID, active: false })).toEqual({ ok: true, data: undefined });
    expect(calls.find((c) => c.method === "update")!.args[0]).toEqual({ active: false });
    expect(calls.find((c) => c.method === "eq")!.args).toEqual(["id", ITEM_ID]);
    expect(mockRevalidate).toHaveBeenCalledWith("/guest-recovery/menu");
    expect(mockRevalidate).toHaveBeenCalledWith("/guest-recovery/new");
  });

  it("shows an item, and doing it twice is still a success", async () => {
    useClient([
      { data: [{ id: ITEM_ID }], error: null },
      { data: [{ id: ITEM_ID }], error: null },
    ]);
    expect((await setMenuItemActive({ id: ITEM_ID, active: true })).ok).toBe(true);
    expect((await setMenuItemActive({ id: ITEM_ID, active: true })).ok).toBe(true);
  });

  it("says so when no item matched", async () => {
    useClient([{ data: [], error: null }]);
    expect(await setMenuItemActive({ id: ITEM_ID, active: true })).toEqual({
      ok: false,
      error: "That item was not found.",
    });
  });

  it("rejects a malformed id before any query", async () => {
    const { from } = useClient([]);
    expect((await setMenuItemActive({ id: "nope", active: true })).ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("setMenuItemMods", () => {
  it("refuses a caller without guest_recovery.manage", async () => {
    mockRequirePermission.mockRejectedValue(new PermissionError("guest_recovery.manage"));
    const { from } = useClient([]);
    expect(await setMenuItemMods({ id: ITEM_ID, modifiable: true, ingredients: "Pickles", addons: "" })).toEqual(DENIED);
    expect(from).not.toHaveBeenCalled();
  });

  it("saves the cleaned lists and refreshes both pages", async () => {
    const { calls } = useClient([{ data: [{ id: ITEM_ID }], error: null }]);
    const result = await setMenuItemMods({
      id: ITEM_ID,
      modifiable: true,
      ingredients: " Pickles, Tomato,, pickles ",
      addons: "Extra sauce",
    });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(calls.find((c) => c.method === "update")?.args[0]).toEqual({
      modifiable: true,
      ingredients: ["Pickles", "Tomato"],
      addons: ["Extra sauce"],
    });
    expect(mockRevalidate).toHaveBeenCalledWith("/guest-recovery/menu");
    expect(mockRevalidate).toHaveBeenCalledWith("/guest-recovery/new");
  });

  it("turning changes off saves the flag", async () => {
    const { calls } = useClient([{ data: [{ id: ITEM_ID }], error: null }]);
    await setMenuItemMods({ id: ITEM_ID, modifiable: false, ingredients: "Pickles", addons: "" });
    expect(calls.find((c) => c.method === "update")?.args[0]).toMatchObject({ modifiable: false });
  });

  it("reports an id that matches nothing, and a bad id", async () => {
    useClient([{ data: [], error: null }]);
    expect(await setMenuItemMods({ id: ITEM_ID, modifiable: true, ingredients: "", addons: "" })).toEqual({
      ok: false,
      error: "That item was not found.",
    });
    expect((await setMenuItemMods({ id: "nope", modifiable: true, ingredients: "", addons: "" })).ok).toBe(false);
  });
});
