import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/permissions")>("@/lib/auth/permissions");
  return { ...actual, requirePermission: vi.fn() };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/guest-recovery/send", () => ({ sendRecoveryMessages: vi.fn() }));
vi.mock("@/lib/guest-recovery/notify", () => ({ notifySpotlightAssignee: vi.fn() }));

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { notifySpotlightAssignee } from "@/lib/guest-recovery/notify";
import { sendRecoveryMessages } from "@/lib/guest-recovery/send";
import {
  assignRecovery,
  giveRecovery,
  logRecovery,
  resendRecovery,
  switchToStandard,
  voidRecovery,
} from "@/app/(app)/guest-recovery/actions";

const mockRequirePermission = vi.mocked(requirePermission);
const mockCreateClient = vi.mocked(createClient);
const mockSend = vi.mocked(sendRecoveryMessages);
const mockNotify = vi.mocked(notifySpotlightAssignee);

const RECOVERY_ID = "44444444-4444-4444-8444-444444444444";
const MENU_ID = "3f2b8c1e-5a4d-4e6f-9a7b-1c2d3e4f5a6b";
const DENIED = { ok: false, error: "You don't have permission to do this." };

const input = {
  submissionId: "9d8c7b6a-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
  guestName: "Nolan Patrick",
  guestEmail: "nolan@example.com",
  guestPhone: "631-555-0142",
  orderNumber: "8407578",
  note: "Chicken sandwich missing",
  smsConsent: true,
  reason: "missing_item" as const,
  path: "standard" as const,
  items: [{ menuItemId: MENU_ID, qty: 2 }],
};

function mockRpc(result: { data?: unknown; error?: { message: string } | null }) {
  const rpc = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  mockCreateClient.mockResolvedValue({ rpc } as never);
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirePermission.mockResolvedValue(undefined);
  mockSend.mockResolvedValue([]);
  mockNotify.mockResolvedValue(true);
});

describe("permission", () => {
  it("refuses a caller without guest_recovery.log before touching the database or sending", async () => {
    mockRequirePermission.mockRejectedValue(new PermissionError("guest_recovery.log"));
    const rpc = mockRpc({});
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
    const rpc = mockRpc({ data: [{ out_id: RECOVERY_ID, out_created: true }] });
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
        p_items: [
          {
            menu_item_id: MENU_ID,
            name: null,
            qty: 2,
            removed: [],
            added: [],
            mod_note: null,
            receipt_ok: null,
            item_ok: null,
            fault_source: null,
          },
        ],
        p_reason: "missing_item",
        p_path: "standard",
      }),
    );
    expect(mockSend).toHaveBeenCalledWith(RECOVERY_ID, "initial");
    expect(result).toMatchObject({ ok: true, data: { id: RECOVERY_ID } });
    if (result.ok) expect(result.data.message).toMatch(/emailed and texted/i);
  });

  it("is safe to submit twice: the second call finds the first recovery and the sends stay claimed", async () => {
    mockRpc({ data: [{ out_id: RECOVERY_ID, out_created: false }] });
    mockSend.mockResolvedValue([
      { channel: "email", result: "already_sent" },
      { channel: "sms", result: "already_sent" },
    ]);
    const result = await logRecovery(input);
    expect(result).toMatchObject({ ok: true, data: { id: RECOVERY_ID } });
    if (result.ok) expect(result.data.message).toMatch(/already/i);
  });

  it("keeps the recovery and says what to do when a send fails", async () => {
    mockRpc({ data: [{ out_id: RECOVERY_ID, out_created: true }] });
    mockSend.mockResolvedValue([{ channel: "email", result: "failed", reason: "bad key" }]);
    const result = await logRecovery(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.message).toMatch(/did not send/i);
  });

  it("rejects bad input with a plain message and never calls the database", async () => {
    const rpc = mockRpc({});
    const result = await logRecovery({ ...input, items: [] });
    expect(result).toEqual({ ok: false, error: "Pick at least one missing item" });
    expect(rpc).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not send when the save fails", async () => {
    mockRpc({ error: { message: "That menu item is not available" } });
    const result = await logRecovery(input);
    expect(result).toEqual({ ok: false, error: "That menu item is not available" });
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("logRecovery: item changes", () => {
  it("sends each line with its changes and a source worked out on the server, never the client's", async () => {
    const rpc = mockRpc({ data: [{ out_id: RECOVERY_ID, out_created: true }] });
    mockSend.mockResolvedValue([{ channel: "email", result: "sent" }]);
    await logRecovery({
      ...input,
      reason: "wrong_item",
      items: [
        { menuItemId: MENU_ID, qty: 1, removed: ["Pickles"], receiptOk: true, itemOk: false, faultSource: "bagging" },
        { menuItemId: MENU_ID, qty: 1, removed: ["Tomato"] },
      ] as never,
    });
    const items = (rpc.mock.calls[0] as unknown as [string, { p_items: Record<string, unknown>[] }])[1].p_items;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ removed: ["Pickles"], receipt_ok: true, item_ok: false, fault_source: "made_wrong" });
    expect(items[1]).toMatchObject({ removed: ["Tomato"], fault_source: null });
  });

  it("a retry with the same submission id sends the same payload, so the database returns the first recovery", async () => {
    const rpc = mockRpc({ data: [{ out_id: RECOVERY_ID, out_created: false }] });
    mockSend.mockResolvedValue([]);
    const withMods = { ...input, items: [{ menuItemId: MENU_ID, qty: 1, removed: ["Pickles"] }] as never };
    await logRecovery(withMods);
    await logRecovery(withMods);
    const ids = rpc.mock.calls.map((c) => (c as unknown as [string, { p_submission_id: string }])[1].p_submission_id);
    expect(new Set(ids).size).toBe(1);
  });
});

describe("resendRecovery", () => {
  it("sends a resend on the chosen channel", async () => {
    mockRpc({});
    mockSend.mockResolvedValue([{ channel: "email", result: "sent" }]);
    const result = await resendRecovery({ id: RECOVERY_ID, channels: ["email"] });
    expect(mockSend).toHaveBeenCalledWith(RECOVERY_ID, "resend", ["email"]);
    expect(result).toMatchObject({ ok: true });
  });

  it("answers a double tap with a wait message, not an error page", async () => {
    mockRpc({});
    mockSend.mockResolvedValue([{ channel: "email", result: "too_soon" }]);
    const result = await resendRecovery({ id: RECOVERY_ID, channels: ["email"] });
    expect(result).toEqual({ ok: false, error: "Just sent. Give it a minute before sending again." });
  });

  it("says so when the recovery is no longer owed", async () => {
    mockRpc({});
    mockSend.mockResolvedValue([]);
    const result = await resendRecovery({ id: RECOVERY_ID });
    expect(result).toEqual({ ok: false, error: "That recovery is not owed any more, so nothing was sent." });
  });

  it("rejects an id that is not a uuid", async () => {
    mockRpc({});
    expect((await resendRecovery({ id: "abc" })).ok).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("giveRecovery and voidRecovery", () => {
  it("hands over once and calls a second scan harmless", async () => {
    const rpc = mockRpc({ data: "given" });
    expect(await giveRecovery({ id: RECOVERY_ID })).toMatchObject({ ok: true, data: { message: "Marked as handed over." } });
    expect(rpc).toHaveBeenCalledWith("give_guest_recovery", { p_id: RECOVERY_ID });

    mockRpc({ data: "already_given" });
    expect(await giveRecovery({ id: RECOVERY_ID })).toMatchObject({
      ok: true,
      data: { message: "Already handed over. Nothing changed." },
    });
  });

  it("will not hand over a voided recovery", async () => {
    mockRpc({ data: "void" });
    const result = await giveRecovery({ id: RECOVERY_ID });
    expect(result.ok).toBe(false);
  });

  it("will not void one that was already handed over", async () => {
    mockRpc({ data: "given" });
    const result = await voidRecovery({ id: RECOVERY_ID });
    expect(result).toEqual({ ok: false, error: "This was already handed over, so it cannot be voided." });
  });

  it("voids an owed recovery", async () => {
    const rpc = mockRpc({ data: "void" });
    expect(await voidRecovery({ id: RECOVERY_ID })).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith("void_guest_recovery", { p_id: RECOVERY_ID });
  });

  it("reports a database permission refusal as a permission message", async () => {
    mockRpc({ error: { message: "You do not have permission to hand over a recovery" } });
    const result = await giveRecovery({ id: RECOVERY_ID });
    expect(result).toEqual({ ok: false, error: "You do not have permission to hand over a recovery" });
  });
});

describe("logRecovery: Spotlight", () => {
  const OVERSEER = "55555555-5555-4555-8555-555555555555";
  const spotlight = { ...input, path: "spotlight" as const };

  it("notifies the assignee once when a Spotlight recovery is created, with no guest details", async () => {
    mockRpc({ data: [{ out_id: RECOVERY_ID, out_created: true, out_assigned_to: OVERSEER }] });
    mockSend.mockResolvedValue([{ channel: "email", result: "sent" }]);
    const result = await logRecovery(spotlight);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(OVERSEER);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.message).not.toMatch(/notif/i);
  });

  it("does not notify again on a repeat submit", async () => {
    mockRpc({ data: [{ out_id: RECOVERY_ID, out_created: false, out_assigned_to: OVERSEER }] });
    await logRecovery(spotlight);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("does not notify for a standard recovery", async () => {
    mockRpc({ data: [{ out_id: RECOVERY_ID, out_created: true, out_assigned_to: null }] });
    await logRecovery(input);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("says plainly when nobody is set up to send the reward", async () => {
    mockRpc({ data: [{ out_id: RECOVERY_ID, out_created: true, out_assigned_to: null }] });
    const result = await logRecovery(spotlight);
    expect(mockNotify).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.message).toMatch(/nobody is set to send|nobody was notified/i);
  });

  it("does not claim someone was notified when the notice failed to write", async () => {
    mockRpc({ data: [{ out_id: RECOVERY_ID, out_created: true, out_assigned_to: OVERSEER }] });
    mockNotify.mockResolvedValueOnce(false);
    const result = await logRecovery(spotlight);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.message).toMatch(/could not tell|tell them/i);
  });

  it("still logs and sends when the notice cannot be delivered", async () => {
    mockRpc({ data: [{ out_id: RECOVERY_ID, out_created: true, out_assigned_to: OVERSEER }] });
    mockNotify.mockRejectedValueOnce(new Error("events down"));
    const result = await logRecovery(spotlight);
    expect(result.ok).toBe(true);
  });

  it("rejects a missing reason before touching the database", async () => {
    const rpc = mockRpc({});
    const { reason: _reason, ...noReason } = input;
    void _reason;
    const result = await logRecovery(noReason as never);
    expect(result).toEqual({ ok: false, error: "Pick a reason" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("switchToStandard", () => {
  it("switches, then sends the normal message once under the switch kind", async () => {
    const rpc = mockRpc({ data: "switched" });
    mockSend.mockResolvedValue([
      { channel: "email", result: "sent" },
      { channel: "sms", result: "sent" },
    ]);
    const result = await switchToStandard({ id: RECOVERY_ID });
    expect(rpc).toHaveBeenCalledWith("switch_guest_recovery_to_standard", { p_id: RECOVERY_ID });
    expect(mockSend).toHaveBeenCalledWith(RECOVERY_ID, "switch");
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.data.message).toMatch(/emailed and texted/i);
  });

  it("never sends a second normal message to a recovery that was standard from the start", async () => {
    mockRpc({ data: "already_standard" });
    const result = await switchToStandard({ id: RECOVERY_ID });
    expect(mockSend).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true });
  });

  it("finishes the send on a retry when it was switched but the message never went", async () => {
    mockRpc({ data: "already_switched" });
    mockSend.mockResolvedValue([
      { channel: "email", result: "sent" },
      { channel: "sms", result: "already_sent" },
    ]);
    const result = await switchToStandard({ id: RECOVERY_ID });
    expect(mockSend).toHaveBeenCalledWith(RECOVERY_ID, "switch");
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.data.message).toMatch(/emailed/i);
  });

  it("says plainly when the retry had nothing left to send", async () => {
    mockRpc({ data: "already_switched" });
    mockSend.mockResolvedValue([
      { channel: "email", result: "already_sent" },
      { channel: "sms", result: "already_sent" },
    ]);
    const result = await switchToStandard({ id: RECOVERY_ID });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.data.message).toMatch(/already/i);
  });

  it("refuses a recovery that is no longer owed or not found", async () => {
    mockRpc({ data: "not_owed" });
    expect((await switchToStandard({ id: RECOVERY_ID })).ok).toBe(false);
    mockRpc({ data: "not_found" });
    expect((await switchToStandard({ id: RECOVERY_ID })).ok).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("refuses a caller without the permission", async () => {
    mockRequirePermission.mockRejectedValue(new PermissionError("guest_recovery.log"));
    mockRpc({});
    expect(await switchToStandard({ id: RECOVERY_ID })).toEqual(DENIED);
  });
});

describe("assignRecovery", () => {
  const NEW_ASSIGNEE = "66666666-6666-4666-8666-666666666666";

  it("tags someone in and tells them", async () => {
    const rpc = mockRpc({ data: "assigned" });
    const result = await assignRecovery({ id: RECOVERY_ID, assigneeId: NEW_ASSIGNEE });
    expect(rpc).toHaveBeenCalledWith("assign_guest_recovery", { p_id: RECOVERY_ID, p_assignee: NEW_ASSIGNEE });
    expect(mockNotify).toHaveBeenCalledWith(NEW_ASSIGNEE);
    expect(result).toMatchObject({ ok: true, data: { message: "Handed over. They have been notified." } });
  });

  it("tells the leader to speak to them when the notice could not be written", async () => {
    mockRpc({ data: "assigned" });
    mockNotify.mockResolvedValueOnce(false);
    const result = await assignRecovery({ id: RECOVERY_ID, assigneeId: NEW_ASSIGNEE });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.data.message).toMatch(/could not|tell them/i);
  });

  it("explains each refusal in plain words and notifies nobody", async () => {
    for (const code of ["not_allowed", "bad_assignee", "not_spotlight", "not_owed", "not_found"]) {
      mockRpc({ data: code });
      const result = await assignRecovery({ id: RECOVERY_ID, assigneeId: NEW_ASSIGNEE });
      expect(result.ok, code).toBe(false);
      if (!result.ok) expect(result.error.length, code).toBeGreaterThan(10);
    }
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("rejects ids that are not uuids and checks permission first", async () => {
    mockRpc({});
    expect((await assignRecovery({ id: "abc", assigneeId: NEW_ASSIGNEE })).ok).toBe(false);
    mockRequirePermission.mockRejectedValue(new PermissionError("guest_recovery.log"));
    expect(await assignRecovery({ id: RECOVERY_ID, assigneeId: NEW_ASSIGNEE })).toEqual(DENIED);
  });
});
