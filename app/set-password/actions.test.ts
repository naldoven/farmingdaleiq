import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const updateUser = vi.fn();
const updateUserById = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser, updateUser } }),
  createServiceRoleClient: () => ({ auth: { admin: { updateUserById } } }),
}));

import { setNewPassword } from "./actions";

const ME = "33333333-3333-4333-8333-333333333333";

describe("setNewPassword", () => {
  beforeEach(() => {
    getUser.mockReset();
    updateUser.mockReset().mockResolvedValue({ error: null });
    updateUserById.mockReset().mockResolvedValue({ error: null });
  });

  it("refuses a password under 8 characters without touching the account", async () => {
    getUser.mockResolvedValue({ data: { user: { id: ME, app_metadata: {} } } });
    const result = await setNewPassword("short");
    expect(result.ok).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("refuses when the person is not signed in (their link session ran out)", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await setNewPassword("a-good-password");
    expect(result.ok).toBe(false);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("clears the temporary-password flag after a successful change, on the caller's own account only", async () => {
    getUser.mockResolvedValue({ data: { user: { id: ME, app_metadata: { must_change_password: true } } } });
    const result = await setNewPassword("a-good-password");
    expect(result).toEqual({ ok: true });
    expect(updateUser).toHaveBeenCalledWith({ password: "a-good-password" });
    expect(updateUserById).toHaveBeenCalledTimes(1);
    expect(updateUserById).toHaveBeenCalledWith(ME, { app_metadata: { must_change_password: false } });
  });

  it("keeps the flag when the change fails (for example the same temporary password again)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: ME, app_metadata: { must_change_password: true } } } });
    updateUser.mockResolvedValue({
      error: { message: "New password should be different from the old password." },
    });
    const result = await setNewPassword("the-temp-password");
    expect(result).toEqual({
      ok: false,
      error: "New password should be different from the old password.",
    });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("retries the flag clear once, then asks for a different password rather than a sign-in", async () => {
    getUser.mockResolvedValue({ data: { user: { id: ME, app_metadata: { must_change_password: true } } } });
    updateUserById.mockResolvedValue({ error: { message: "boom" } });
    const result = await setNewPassword("a-good-password");
    expect(updateUserById).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain("different new password");
  });

  it("makes no admin call for a person who was never flagged", async () => {
    getUser.mockResolvedValue({ data: { user: { id: ME, app_metadata: {} } } });
    const result = await setNewPassword("a-good-password");
    expect(result).toEqual({ ok: true });
    expect(updateUserById).not.toHaveBeenCalled();
  });
});
