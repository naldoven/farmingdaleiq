import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePath, createClient } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { rejectClean } from "./today-actions";

const ID = "11111111-1111-4111-8111-111111111111";

interface FakeOptions {
  canPlan?: boolean;
  rejectResult?: string | null;
  rejectError?: { code?: string; message: string } | null;
}

/** Just enough client for requireCleaningPlanner, loadStoreClock and the reject call. */
function fakeSupabase({ canPlan = true, rejectResult = "rejected", rejectError = null }: FakeOptions = {}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "can_plan_cleaning") return { data: canPlan, error: null };
    if (name === "reject_cleaning_assignment") return { data: rejectResult, error: rejectError };
    throw new Error(`unexpected rpc ${name}`);
  });
  const from = vi.fn(() => ({
    select: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { timezone: "America/New_York" }, error: null }) }) }),
  }));
  return { rpc, from };
}

function rejectCall(client: ReturnType<typeof fakeSupabase>) {
  // The fake's rpc ignores its arguments, so its recorded calls are typed as
  // name-only; the real calls carry the parameter object as the second item.
  const calls = client.rpc.mock.calls as unknown as [string, Record<string, unknown>][];
  return calls.find(([name]) => name === "reject_cleaning_assignment");
}

beforeEach(() => {
  revalidatePath.mockReset();
  createClient.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rejectClean", () => {
  it("sends a morning rejection to the PM list the same day", async () => {
    vi.setSystemTime(new Date("2026-10-28T14:00:00Z")); // Wed 10:00 AM Eastern
    const client = fakeSupabase();
    createClient.mockResolvedValue(client);

    const result = await rejectClean({ id: ID, note: "  Vent still dusty  " });

    expect(result).toEqual({ ok: true, data: undefined });
    expect(rejectCall(client)).toEqual([
      "reject_cleaning_assignment",
      { p_assignment_id: ID, p_note: "Vent still dusty", p_redo_date: "2026-10-28", p_redo_half: "pm" },
    ]);
  });

  it("sends an afternoon rejection to tomorrow's AM list, by store time and not the server clock", async () => {
    // 11:30 PM Eastern on Wed is already Thursday in UTC; the redo must still be Thursday AM.
    vi.setSystemTime(new Date("2026-10-29T03:30:00Z"));
    const client = fakeSupabase();
    createClient.mockResolvedValue(client);

    await rejectClean({ id: ID, note: "Redo the gaskets" });

    expect(rejectCall(client)![1]).toMatchObject({ p_redo_date: "2026-10-29", p_redo_half: "am" });
  });

  it("rolls a Saturday afternoon rejection over Sunday to Monday AM", async () => {
    vi.setSystemTime(new Date("2026-10-31T20:00:00Z")); // Sat 4:00 PM Eastern
    const client = fakeSupabase();
    createClient.mockResolvedValue(client);

    await rejectClean({ id: ID, note: "Mop sink still dirty" });

    expect(rejectCall(client)![1]).toMatchObject({ p_redo_date: "2026-11-02", p_redo_half: "am" });
  });

  it("sends a Sunday rejection to Monday AM", async () => {
    vi.setSystemTime(new Date("2026-10-25T15:00:00Z")); // Sun 11:00 AM Eastern
    const client = fakeSupabase();
    createClient.mockResolvedValue(client);

    await rejectClean({ id: ID, note: "Check again" });

    expect(rejectCall(client)![1]).toMatchObject({ p_redo_date: "2026-10-26", p_redo_half: "am" });
  });

  it("refreshes the Today screen and the week board on success", async () => {
    vi.setSystemTime(new Date("2026-10-28T14:00:00Z"));
    createClient.mockResolvedValue(fakeSupabase());

    await rejectClean({ id: ID, note: "Not clean" });

    expect(revalidatePath).toHaveBeenCalledWith("/cleaning");
    expect(revalidatePath).toHaveBeenCalledWith("/cleaning/week");
  });

  it("refuses anyone without planning rights and never reaches the database function", async () => {
    vi.setSystemTime(new Date("2026-10-28T14:00:00Z"));
    const client = fakeSupabase({ canPlan: false });
    createClient.mockResolvedValue(client);

    const result = await rejectClean({ id: ID, note: "Not clean" });

    expect(result).toEqual({ ok: false, error: "You don't have permission to do this." });
    expect(rejectCall(client)).toBeUndefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("requires a note and does not call the database without one", async () => {
    vi.setSystemTime(new Date("2026-10-28T14:00:00Z"));
    const client = fakeSupabase();
    createClient.mockResolvedValue(client);

    const blank = await rejectClean({ id: ID, note: "   " });
    const tooLong = await rejectClean({ id: ID, note: "x".repeat(301) });

    expect(blank).toEqual({ ok: false, error: "Say what needs redoing." });
    expect(tooLong.ok).toBe(false);
    expect(rejectCall(client)).toBeUndefined();
  });

  it("reports an unfinished clean as a friendly error, not a crash", async () => {
    vi.setSystemTime(new Date("2026-10-28T14:00:00Z"));
    createClient.mockResolvedValue(fakeSupabase({ rejectResult: "not_open" }));

    const result = await rejectClean({ id: ID, note: "Not clean" });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/not finished/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("treats a retry that finds the clean already rejected as success", async () => {
    vi.setSystemTime(new Date("2026-10-28T14:00:00Z"));
    createClient.mockResolvedValue(fakeSupabase({ rejectResult: "already_rejected" }));

    expect(await rejectClean({ id: ID, note: "Not clean" })).toEqual({ ok: true, data: undefined });
  });

  it("maps a database permission refusal and hides other database text", async () => {
    vi.setSystemTime(new Date("2026-10-28T14:00:00Z"));
    createClient.mockResolvedValue(fakeSupabase({ rejectResult: null, rejectError: { code: "42501", message: "cleaning.plan required" } }));
    expect(await rejectClean({ id: ID, note: "Not clean" })).toEqual({ ok: false, error: "You don't have permission to do this." });

    createClient.mockResolvedValue(fakeSupabase({ rejectResult: null, rejectError: { code: "08006", message: "connection failure at 10.0.0.4" } }));
    const other = await rejectClean({ id: ID, note: "Not clean" });
    expect(other).toEqual({ ok: false, error: "Could not reject this clean. Try again." });
  });

  it("never throws, even when the client cannot be created", async () => {
    createClient.mockRejectedValue(new Error("no cookies"));
    const result = await rejectClean({ id: ID, note: "Not clean" });
    expect(result.ok).toBe(false);
  });
});
