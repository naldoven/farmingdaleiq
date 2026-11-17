import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const getUser = vi.fn();
const updateUserById = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp, getUser } }),
  createServiceRoleClient: () => ({ auth: { admin: { updateUserById } } }),
}));

// The real redirect() throws to stop the action; mirror that so code after a
// redirect can never run in the test either.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));

import { confirmSetupLink } from "./actions";

const PERSON = "44444444-4444-4444-8444-444444444444";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("confirmSetupLink (the button on /auth/confirm)", () => {
  beforeEach(() => {
    verifyOtp.mockReset().mockResolvedValue({ data: { user: { id: PERSON } }, error: null });
    getUser.mockReset().mockResolvedValue({ data: { user: null } });
    updateUserById.mockReset().mockResolvedValue({ error: null });
  });

  it("spends the one-time token only here, then sends the person to /set-password", async () => {
    await expect(confirmSetupLink(form({ token_hash: "abc123", type: "recovery" }))).rejects.toThrow(
      "REDIRECT:/set-password",
    );
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc123" });
  });

  it("flags the verified account so the link's session must end in a new password", async () => {
    await expect(confirmSetupLink(form({ token_hash: "abc123", type: "recovery" }))).rejects.toThrow(
      "REDIRECT:/set-password",
    );
    expect(updateUserById).toHaveBeenCalledWith(PERSON, {
      app_metadata: { must_change_password: true },
    });
  });

  it("still goes on to /set-password if the flag write fails", async () => {
    updateUserById.mockResolvedValue({ error: { message: "boom" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(confirmSetupLink(form({ token_hash: "abc", type: "recovery" }))).rejects.toThrow(
      "REDIRECT:/set-password",
    );
    spy.mockRestore();
  });

  it("sends a used or expired token to /login?error=auth and flags nobody", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: "Email link is invalid or has expired" } });
    await expect(confirmSetupLink(form({ token_hash: "abc", type: "recovery" }))).rejects.toThrow(
      "REDIRECT:/login?error=auth",
    );
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("sends a second tap on to /set-password when the first tap already opened a flagged session", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: "Email link is invalid or has expired" } });
    getUser.mockResolvedValue({ data: { user: { id: PERSON, app_metadata: { must_change_password: true } } } });
    await expect(confirmSetupLink(form({ token_hash: "abc", type: "recovery" }))).rejects.toThrow(
      "REDIRECT:/set-password",
    );
  });

  it("does not send a signed-in person with no flag to /set-password on a dead link", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    getUser.mockResolvedValue({ data: { user: { id: "manager", app_metadata: {} } } });
    await expect(confirmSetupLink(form({ token_hash: "abc", type: "recovery" }))).rejects.toThrow(
      "REDIRECT:/login?error=auth",
    );
  });

  it("refuses any link type other than recovery without calling Supabase", async () => {
    await expect(confirmSetupLink(form({ token_hash: "abc", type: "email_change" }))).rejects.toThrow(
      "REDIRECT:/login?error=auth",
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("refuses a missing or oversized token without calling Supabase", async () => {
    await expect(confirmSetupLink(form({ type: "recovery" }))).rejects.toThrow("REDIRECT:/login?error=auth");
    await expect(
      confirmSetupLink(form({ token_hash: "x".repeat(600), type: "recovery" })),
    ).rejects.toThrow("REDIRECT:/login?error=auth");
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
