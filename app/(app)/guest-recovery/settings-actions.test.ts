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
import { saveRecoverySettings, setOverseerOff } from "@/app/(app)/guest-recovery/settings-actions";

const mockRequirePermission = vi.mocked(requirePermission);
const mockCreateClient = vi.mocked(createClient);
const mockRevalidate = vi.mocked(revalidatePath);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const DENIED = { ok: false, error: "You don't have permission to do this." };

function useRpc(result: { data?: unknown; error?: { message: string } | null }) {
  const rpc = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  mockCreateClient.mockResolvedValue({ rpc } as never);
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermission.mockResolvedValue(undefined);
});

describe("permission", () => {
  it("saveRecoverySettings needs guest_recovery.manage and never reaches the database", async () => {
    mockRequirePermission.mockRejectedValue(new PermissionError("guest_recovery.manage"));
    const rpc = useRpc({});
    expect(await saveRecoverySettings({ expiryDays: 60, overseerId: A, backupId: B })).toEqual(DENIED);
    expect(mockRequirePermission).toHaveBeenCalledWith("guest_recovery.manage");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("setOverseerOff needs guest_recovery.log and never reaches the database", async () => {
    mockRequirePermission.mockRejectedValue(new PermissionError("guest_recovery.log"));
    const rpc = useRpc({});
    expect(await setOverseerOff({ off: true })).toEqual(DENIED);
    expect(mockRequirePermission).toHaveBeenCalledWith("guest_recovery.log");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("saveRecoverySettings", () => {
  it("rejects too few days", async () => {
    const rpc = useRpc({ data: "saved" });
    const result = await saveRecoverySettings({ expiryDays: 6, overseerId: A, backupId: B });
    expect(result.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects the same person as overseer and backup", async () => {
    const rpc = useRpc({ data: "saved" });
    const result = await saveRecoverySettings({ expiryDays: 60, overseerId: A, backupId: A });
    expect(result).toEqual({ ok: false, error: "The backup must be a different person" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("saves through the database function and refreshes both pages", async () => {
    const rpc = useRpc({ data: "saved" });
    const result = await saveRecoverySettings({ expiryDays: 60, overseerId: A, backupId: null });
    expect(rpc).toHaveBeenCalledWith("save_guest_recovery_settings", {
      p_expiry_days: 60,
      p_overseer: A,
      p_backup: null,
    });
    expect(result).toEqual({ ok: true, data: undefined });
    expect(mockRevalidate).toHaveBeenCalledWith("/guest-recovery/menu/settings");
    expect(mockRevalidate).toHaveBeenCalledWith("/guest-recovery");
  });

  it("explains bad_person in plain words", async () => {
    useRpc({ data: "bad_person" });
    expect(await saveRecoverySettings({ expiryDays: 60, overseerId: A, backupId: B })).toEqual({
      ok: false,
      error: "Pick people who can work Guest Recovery (Team Leader and up).",
    });
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it("returns a database error instead of throwing", async () => {
    useRpc({ error: { message: "boom" } });
    expect(await saveRecoverySettings({ expiryDays: 60, overseerId: A, backupId: B })).toEqual({
      ok: false,
      error: "boom",
    });
  });
});

describe("setOverseerOff", () => {
  it("passes the flag to the database function", async () => {
    const rpc = useRpc({ data: "saved" });
    expect(await setOverseerOff({ off: true })).toEqual({ ok: true, data: undefined });
    expect(rpc).toHaveBeenCalledWith("set_guest_recovery_overseer_off", { p_off: true });
    expect(mockRevalidate).toHaveBeenCalledWith("/guest-recovery");
  });

  it("explains not_allowed", async () => {
    useRpc({ data: "not_allowed" });
    expect(await setOverseerOff({ off: true })).toEqual({
      ok: false,
      error: "Only the overseer or a manager can change this.",
    });
  });

  it("returns a database error instead of throwing", async () => {
    useRpc({ error: { message: "boom" } });
    expect(await setOverseerOff({ off: false })).toEqual({ ok: false, error: "boom" });
  });
});
