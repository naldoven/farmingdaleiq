import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/permissions")>("@/lib/auth/permissions");
  return { ...actual, requirePermission: vi.fn() };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/guest-recovery/send", () => ({ sendRecoveryMessages: vi.fn() }));

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { sendRecoveryMessages } from "@/lib/guest-recovery/send";
import { giveRecovery, logRecovery, resendRecovery, voidRecovery } from "@/app/(app)/guest-recovery/actions";

const mockRequirePermission = vi.mocked(requirePermission);
const mockCreateClient = vi.mocked(createClient);
const mockSend = vi.mocked(sendRecoveryMessages);

const RECOVERY_ID = "44444444-4444-4444-8444-444444444444";
const MENU_ID = "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b";
const DENIED = { ok: false, error: "You don't have permission to do this." };

const input = {
  submissionId: "9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  guestName: "Nolan Patrick",
  guestEmail: "nolan@example.com",
  guestPhone: "631-555-0142",
  orderNumber: "8407578",
  note: "",
  smsConsent: true,
  items: [{ menuItemId: MENU_ID, qty: 2 }],
};

function useRpc(result: { data?: unknown; error?: { message: string } | null }) {
  const rpc = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  mockCreateClient.mockResolvedValue({ rpc } as never);
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermission.mockResolvedValue(undefined);
  mockSend.mockResolvedValue([]);
});

describe("permission", () => {
  it("refuses a caller without guest_recovery.log before touching the database or sending", async () => {
    mockRequirePermission.mockRejectedValue(new PermissionError("guest_recovery.log"));
    const rpc = useRpc({});
    expect(await logRecovery(input)).toEqual(DENIED);
    expect(await resendRecovery({ id: RECOVERY_ID })).toEqual(DENIED);
    expect(await giveRecovery({ id: RECOVERY_ID })).toEqual(DENIED);
    expect(await voidRecovery({ id: RECOVERY_ID })).toEqual(DENIED);
    expect(mockRequirePermission).toHaveBeenCalledWith("guest_recovery.log");
    expect(rpc).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("logRecovery", () => {
  it("saves through the database function with a normalized phone, then sends the first messages", async () => {
    const rpc = useRpc({ data: [{ out_id: RECOVERY_ID, out_created: true }] });
    mockSend.mockResolvedValue([
      { channel: "email", result: "sent" },
      { channel: "sms", result: "sent" },
    ]);
    const result = await logRecovery(input);
    expect(rpc).toHaveBeenCalledWith(
      "log_guest_recovery",
      expect.objectContaining({
        p_submission_id: input.submissionId,
        p_guest_phone: "+16315550142",
        p_guest_email: "nolan@example.com",
        p_sms_consent: true,
        p_items: [{ menu_item_id: MENU_ID, name: null, qty: 2 }],
      }),
    );
    expect(mockSend).toHaveBeenCalledWith(RECOVERY_ID, "initial");
    expect(result).toMatchObject({ ok: true, data: { id: RECOVERY_ID } });
    if (result.ok) expect(result.data.message).toMatch(/emailed and texted/i);
  });

  it("is safe to submit twice: the second call finds the first recovery and the sends stay claimed", async () => {
    useRpc({ data: [{ out_id: RECOVERY_ID, out_created: false }] });
    mockSend.mockResolvedValue([
      { channel: "email", result: "already_sent" },
      { channel: "sms", result: "already_sent" },
    ]);
    const result = await logRecovery(input);
    expect(result).toMatchObject({ ok: true, data: { id: RECOVERY_ID } });
    if (result.ok) expect(result.data.message).toMatch(/already/i);
  });

  it("keeps the recovery and says what to do when a send fails", async () => {
    useRpc({ data: [{ out_id: RECOVERY_ID, out_created: true }] });
    mockSend.mockResolvedValue([{ channel: "email", result: "failed", reason: "bad key" }]);
    const result = await logRecovery(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.message).toMatch(/did not send/i);
  });

  it("rejects bad input with a plain message and never calls the database", async () => {
    const rpc = useRpc({});
    const result = await logRecovery({ ...input, items: [] });
    expect(result).toEqual({ ok: false, error: "Pick at least one missing item" });
    expect(rpc).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not send when the save fails", async () => {
    useRpc({ error: { message: "That menu item is not available" } });
    const result = await logRecovery(input);
    expect(result).toEqual({ ok: false, error: "That menu item is not available" });
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("resendRecovery", () => {
  it("sends a resend on the chosen channel", async () => {
    useRpc({});
    mockSend.mockResolvedValue([{ channel: "email", result: "sent" }]);
    const result = await resendRecovery({ id: RECOVERY_ID, channels: ["email"] });
    expect(mockSend).toHaveBeenCalledWith(RECOVERY_ID, "resend", ["email"]);
    expect(result).toMatchObject({ ok: true });
  });

  it("answers a double tap with a wait message, not an error page", async () => {
    useRpc({});
    mockSend.mockResolvedValue([{ channel: "email", result: "too_soon" }]);
    const result = await resendRecovery({ id: RECOVERY_ID, channels: ["email"] });
    expect(result).toEqual({ ok: false, error: "Just sent. Give it a minute before sending again." });
  });

  it("says so when the recovery is no longer owed", async () => {
    useRpc({});
    mockSend.mockResolvedValue([]);
    const result = await resendRecovery({ id: RECOVERY_ID });
    expect(result).toEqual({ ok: false, error: "That recovery is not owed any more, so nothing was sent." });
  });

  it("rejects an id that is not a uuid", async () => {
    useRpc({});
    expect((await resendRecovery({ id: "abc" })).ok).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("giveRecovery and voidRecovery", () => {
  it("hands over once and calls a second scan harmless", async () => {
    const rpc = useRpc({ data: "given" });
    expect(await giveRecovery({ id: RECOVERY_ID })).toMatchObject({ ok: true, data: { message: "Marked as handed over." } });
    expect(rpc).toHaveBeenCalledWith("give_guest_recovery", { p_id: RECOVERY_ID });

    useRpc({ data: "already_given" });
    expect(await giveRecovery({ id: RECOVERY_ID })).toMatchObject({
      ok: true,
      data: { message: "Already handed over. Nothing changed." },
    });
  });

  it("will not hand over a voided recovery", async () => {
    useRpc({ data: "void" });
    const result = await giveRecovery({ id: RECOVERY_ID });
    expect(result.ok).toBe(false);
  });

  it("will not void one that was already handed over", async () => {
    useRpc({ data: "given" });
    const result = await voidRecovery({ id: RECOVERY_ID });
    expect(result).toEqual({ ok: false, error: "This was already handed over, so it cannot be voided." });
  });

  it("voids an owed recovery", async () => {
    const rpc = useRpc({ data: "void" });
    expect(await voidRecovery({ id: RECOVERY_ID })).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith("void_guest_recovery", { p_id: RECOVERY_ID });
  });

  it("reports a database permission refusal as a permission message", async () => {
    useRpc({ error: { message: "You do not have permission to hand over a recovery" } });
    const result = await giveRecovery({ id: RECOVERY_ID });
    expect(result).toEqual({ ok: false, error: "You do not have permission to hand over a recovery" });
  });
});
