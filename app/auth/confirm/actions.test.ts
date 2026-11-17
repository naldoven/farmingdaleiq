import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const getUser = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();
const updateUserById = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp, getUser, updateUser, signOut } }),
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
const START = { error: null };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const good = { token_hash: "abc123", type: "recovery", password: "a-good-password", confirm: "a-good-password" };

describe("confirmSetupLink (the new-password form on /auth/confirm)", () => {
  beforeEach(() => {
    verifyOtp.mockReset().mockResolvedValue({ data: { user: { id: PERSON } }, error: null });
    getUser.mockReset().mockResolvedValue({ data: { user: null } });
    updateUser.mockReset().mockResolvedValue({ error: null });
    signOut.mockReset().mockResolvedValue({ error: null });
    updateUserById.mockReset().mockResolvedValue({ error: null });
  });

  it("spends the token and saves the password in one step, then opens the app", async () => {
    await expect(confirmSetupLink(START, form(good))).rejects.toThrow("REDIRECT:/");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc123" });
    expect(updateUser).toHaveBeenCalledWith({ password: "a-good-password" });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("checks the password before touching the token, so a typo never burns the link", async () => {
    await expect(confirmSetupLink(START, form({ ...good, password: "short", confirm: "short" }))).resolves.toEqual({
      error: "Use at least 8 characters.",
    });
    await expect(confirmSetupLink(START, form({ ...good, confirm: "something-else" }))).resolves.toEqual({
      error: "The passwords don't match.",
    });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("never swaps a signed-in person into another account: sends them home with the token untouched", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "someone-else" } } });
    await expect(confirmSetupLink(START, form(good))).rejects.toThrow("REDIRECT:/");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("sends a used or expired token to /login?error=auth", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: "Email link is invalid or has expired" } });
    await expect(confirmSetupLink(START, form(good))).rejects.toThrow("REDIRECT:/login?error=auth");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("flags the account and holds it on /set-password when Supabase refuses the password", async () => {
    updateUser.mockResolvedValue({ error: { message: "Password is too weak" } });
    await expect(confirmSetupLink(START, form(good))).rejects.toThrow("REDIRECT:/set-password");
    expect(updateUserById).toHaveBeenCalledWith(PERSON, {
      app_metadata: { must_change_password: true },
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signs the session out rather than leave it unflagged when the flag write also fails", async () => {
    updateUser.mockResolvedValue({ error: { message: "Password is too weak" } });
    updateUserById.mockResolvedValue({ error: { message: "boom" } });
    await expect(confirmSetupLink(START, form(good))).rejects.toThrow("REDIRECT:/login?error=auth");
    expect(signOut).toHaveBeenCalled();
  });

  it("refuses any link type other than recovery without calling Supabase", async () => {
    await expect(confirmSetupLink(START, form({ ...good, type: "email_change" }))).rejects.toThrow(
      "REDIRECT:/login?error=auth",
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("refuses a missing or oversized token without calling Supabase", async () => {
    const { token_hash: _omit, ...noToken } = good;
    void _omit;
    await expect(confirmSetupLink(START, form(noToken))).rejects.toThrow("REDIRECT:/login?error=auth");
    await expect(confirmSetupLink(START, form({ ...good, token_hash: "x".repeat(600) }))).rejects.toThrow(
      "REDIRECT:/login?error=auth",
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
