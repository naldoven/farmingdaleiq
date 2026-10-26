import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guard-first coverage for the Cleaning settings actions. The invariant that
 * matters most: a coordinator (planning rights from the tag, not the key)
 * can change caps and zones but can never hand out the tag, and a refused
 * call never reaches a table.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/permissions")>("@/lib/auth/permissions");
  return { ...actual, requirePermission: vi.fn() };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { revalidatePath } from "next/cache";

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  addCoordinator,
  removeCoordinator,
  saveSlotCaps,
  setZoneActive,
} from "@/app/(app)/cleaning/settings-actions";

const mockRequirePermission = vi.mocked(requirePermission);
const mockCreateClient = vi.mocked(createClient);
const mockRevalidate = vi.mocked(revalidatePath);

const USER_ID = "22222222-2222-4222-8222-222222222222";
const ZONE_ID = "33333333-3333-4333-8333-333333333333";
const DENIED = { ok: false, error: "You don't have permission to do this." };

type Result = { data?: unknown; error?: { message: string; code?: string } | null };

/**
 * Chainable stand-in for the supabase-js builder: every method returns the
 * builder, and awaiting it (or maybeSingle) yields the table's preset result.
 */
function makeClient(options: { canPlan: boolean; tables?: Record<string, Result> }) {
  const builders: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};
  const from = vi.fn((table: string) => {
    const result = options.tables?.[table] ?? { data: null, error: null };
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    const chain = () => builder;
    for (const method of ["select", "eq", "in", "gt", "limit", "update", "upsert", "insert", "delete"]) {
      builder[method] = vi.fn(chain);
    }
    builder.maybeSingle = vi.fn(async () => result);
    (builder as Record<string, unknown>).then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve);
    builders[table] = builder;
    return builder;
  });
  const client = { rpc: vi.fn(async () => ({ data: options.canPlan, error: null })), from };
  return { client, from, builders };
}

function useClient(options: Parameters<typeof makeClient>[0]) {
  const made = makeClient(options);
  mockCreateClient.mockResolvedValue(made.client as never);
  return made;
}

const ALL_CAPS = Array.from({ length: 6 }, (_, i) => i + 1).flatMap((weekday) => [
  { weekday, half: "am" as const, maxVariables: 2 },
  { weekday, half: "pm" as const, maxVariables: 2 },
]);

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermission.mockResolvedValue(undefined);
});

describe("planner-only actions", () => {
  it("refuse a caller without planning rights and never touch a table", async () => {
    const { from } = useClient({ canPlan: false });

    expect(await saveSlotCaps({ caps: ALL_CAPS })).toEqual(DENIED);
    expect(await setZoneActive({ id: ZONE_ID, active: true })).toEqual(DENIED);
    expect(from).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});

describe("coordinator tag actions", () => {
  beforeEach(() => {
    mockRequirePermission.mockRejectedValue(new PermissionError("cleaning.plan"));
  });

  it("refuse a coordinator who has planning rights only through the tag", async () => {
    // canPlan is true: the caller can plan, yet still cannot hand out the tag.
    const { from } = useClient({ canPlan: true });

    expect(await addCoordinator({ userId: USER_ID })).toEqual(DENIED);
    expect(await removeCoordinator({ userId: USER_ID })).toEqual(DENIED);
    expect(mockRequirePermission).toHaveBeenCalledWith("cleaning.plan");
    expect(from).not.toHaveBeenCalled();
  });
});

describe("saveSlotCaps", () => {
  it("upserts all twelve slots on (weekday, half) and refreshes the board", async () => {
    const { builders } = useClient({ canPlan: true });
    const caps = ALL_CAPS.map((c) => (c.weekday === 4 && c.half === "am" ? { ...c, maxVariables: 0 } : c));

    expect(await saveSlotCaps({ caps })).toEqual({ ok: true, data: undefined });

    const upsert = builders.cleaning_slot_caps!.upsert!;
    const [rows, options] = upsert.mock.calls[0]!;
    expect(rows).toHaveLength(12);
    expect(rows).toContainEqual({ weekday: 4, half: "am", max_variables: 0 });
    expect(options).toEqual({ onConflict: "weekday,half" });
    expect(mockRevalidate).toHaveBeenCalledWith("/cleaning/settings");
    expect(mockRevalidate).toHaveBeenCalledWith("/cleaning/week");
  });

  it("sends a repeated slot once, last value winning", async () => {
    const { builders } = useClient({ canPlan: true });
    await saveSlotCaps({
      caps: [
        { weekday: 1, half: "am", maxVariables: 1 },
        { weekday: 1, half: "am", maxVariables: 5 },
      ],
    });
    const [rows] = builders.cleaning_slot_caps!.upsert!.mock.calls[0]!;
    expect(rows).toEqual([{ weekday: 1, half: "am", max_variables: 5 }]);
  });

  it("rejects a cap above 20 or below 0 before writing", async () => {
    const { from } = useClient({ canPlan: true });
    const high = await saveSlotCaps({ caps: [{ weekday: 1, half: "am", maxVariables: 21 }] });
    const low = await saveSlotCaps({ caps: [{ weekday: 1, half: "am", maxVariables: -1 }] });
    expect(high.ok).toBe(false);
    expect(low.ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects Sunday, which has no slot", async () => {
    const { from } = useClient({ canPlan: true });
    const result = await saveSlotCaps({ caps: [{ weekday: 7, half: "am", maxVariables: 2 }] });
    expect(result.ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns the database error instead of throwing", async () => {
    useClient({ canPlan: true, tables: { cleaning_slot_caps: { error: { message: "boom" } } } });
    expect(await saveSlotCaps({ caps: ALL_CAPS })).toEqual({ ok: false, error: "boom" });
    expect(mockRevalidate).not.toHaveBeenCalled();
  });
});

describe("setZoneActive", () => {
  it("switches the zone and refreshes the board", async () => {
    const { builders } = useClient({
      canPlan: true,
      tables: { cleaning_zones: { data: [{ id: ZONE_ID }], error: null } },
    });
    expect(await setZoneActive({ id: ZONE_ID, active: false })).toEqual({ ok: true, data: undefined });
    expect(builders.cleaning_zones!.update!).toHaveBeenCalledWith({ active: false });
    expect(builders.cleaning_zones!.eq!).toHaveBeenCalledWith("id", ZONE_ID);
    expect(mockRevalidate).toHaveBeenCalledWith("/cleaning/week");
  });

  it("takes a hidden zone's open cleans from tomorrow on off the board", async () => {
    const { builders } = useClient({
      canPlan: true,
      tables: {
        cleaning_zones: { data: [{ id: ZONE_ID }], error: null },
        cleaning_items: { data: [{ id: USER_ID }], error: null },
      },
    });
    expect(await setZoneActive({ id: ZONE_ID, active: false })).toEqual({ ok: true, data: undefined });
    const board = builders.cleaning_assignments!;
    expect(board.delete!).toHaveBeenCalled();
    expect(board.in!).toHaveBeenCalledWith("item_id", [USER_ID]);
    expect(board.eq!).toHaveBeenCalledWith("status", "planned");
    expect(board.gt!).toHaveBeenCalledWith("date", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it("leaves the board alone when a zone is switched on", async () => {
    const { builders } = useClient({
      canPlan: true,
      tables: { cleaning_zones: { data: [{ id: ZONE_ID }], error: null } },
    });
    expect(await setZoneActive({ id: ZONE_ID, active: true })).toEqual({ ok: true, data: undefined });
    expect(builders.cleaning_assignments).toBeUndefined();
  });

  it("says so when no zone matched, instead of reporting a save", async () => {
    useClient({ canPlan: true, tables: { cleaning_zones: { data: [], error: null } } });
    expect(await setZoneActive({ id: ZONE_ID, active: true })).toEqual({ ok: false, error: "That zone was not found." });
  });

  it("rejects a malformed id before writing", async () => {
    const { from } = useClient({ canPlan: true });
    expect((await setZoneActive({ id: "not-a-uuid", active: true })).ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("addCoordinator", () => {
  const leader = {
    profiles: { data: { active: true, role_id: "role-1" }, error: null },
    roles: { data: { rank: 6 }, error: null },
  };

  it("tags an active leader and inserts nothing but the user id", async () => {
    const { builders } = useClient({ canPlan: true, tables: { ...leader, cleaning_coordinators: { error: null } } });
    expect(await addCoordinator({ userId: USER_ID })).toEqual({ ok: true, data: undefined });
    expect(builders.cleaning_coordinators!.insert!).toHaveBeenCalledWith({ user_id: USER_ID });
    expect(mockRevalidate).toHaveBeenCalledWith("/cleaning/settings");
  });

  it("treats an existing tag as success", async () => {
    useClient({
      canPlan: true,
      tables: { ...leader, cleaning_coordinators: { error: { message: "duplicate key", code: "23505" } } },
    });
    expect(await addCoordinator({ userId: USER_ID })).toEqual({ ok: true, data: undefined });
  });

  it("surfaces any other insert error", async () => {
    useClient({ canPlan: true, tables: { ...leader, cleaning_coordinators: { error: { message: "nope", code: "42501" } } } });
    expect(await addCoordinator({ userId: USER_ID })).toEqual({ ok: false, error: "nope" });
  });

  it("refuses a team member, so a hand-built request cannot tag one", async () => {
    const { builders } = useClient({
      canPlan: true,
      tables: { profiles: leader.profiles, roles: { data: { rank: 10 }, error: null } },
    });
    const result = await addCoordinator({ userId: USER_ID });
    expect(result.ok).toBe(false);
    expect(builders.cleaning_coordinators).toBeUndefined();
  });

  it("refuses an inactive profile and a profile with no role", async () => {
    const inactive = useClient({
      canPlan: true,
      tables: { profiles: { data: { active: false, role_id: "role-1" }, error: null }, roles: leader.roles },
    });
    expect((await addCoordinator({ userId: USER_ID })).ok).toBe(false);
    expect(inactive.builders.cleaning_coordinators).toBeUndefined();

    const noRole = useClient({ canPlan: true, tables: { profiles: { data: { active: true, role_id: null }, error: null } } });
    expect((await addCoordinator({ userId: USER_ID })).ok).toBe(false);
    expect(noRole.builders.cleaning_coordinators).toBeUndefined();
  });

  it("reports a person who does not exist", async () => {
    useClient({ canPlan: true, tables: { profiles: { data: null, error: null } } });
    expect(await addCoordinator({ userId: USER_ID })).toEqual({ ok: false, error: "That person was not found." });
  });

  it("rejects a malformed id before any lookup", async () => {
    const { from } = useClient({ canPlan: true });
    expect((await addCoordinator({ userId: "nope" })).ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("removeCoordinator", () => {
  it("deletes by user id and refreshes", async () => {
    const { builders } = useClient({ canPlan: true, tables: { cleaning_coordinators: { error: null } } });
    expect(await removeCoordinator({ userId: USER_ID })).toEqual({ ok: true, data: undefined });
    expect(builders.cleaning_coordinators!.delete!).toHaveBeenCalled();
    expect(builders.cleaning_coordinators!.eq!).toHaveBeenCalledWith("user_id", USER_ID);
    expect(mockRevalidate).toHaveBeenCalledWith("/cleaning/settings");
  });

  it("returns the database error instead of throwing", async () => {
    useClient({ canPlan: true, tables: { cleaning_coordinators: { error: { message: "denied" } } } });
    expect(await removeCoordinator({ userId: USER_ID })).toEqual({ ok: false, error: "denied" });
  });
});
