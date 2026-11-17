import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const getUser = vi.fn();
const confirmSetupLink = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp, getUser } }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/app/auth/confirm/actions", () => ({
  confirmSetupLink: (...args: unknown[]) => confirmSetupLink(...args),
}));

import ConfirmPage from "./page";

async function renderPage(query: Record<string, string | string[] | undefined>) {
  const ui = await ConfirmPage({ searchParams: Promise.resolve(query) });
  return render(ui);
}

describe("/auth/confirm page", () => {
  afterEach(cleanup);

  beforeEach(() => {
    verifyOtp.mockReset();
    getUser.mockReset().mockResolvedValue({ data: { user: null } });
    confirmSetupLink.mockReset();
  });

  it("does nothing to the token on page load, so a text or email preview cannot use it up", async () => {
    const { container } = await renderPage({ token_hash: "abc123", type: "recovery" });

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(confirmSetupLink).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Set password" })).toBeTruthy();
    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm password")).toBeTruthy();

    const tokenInput = container.querySelector<HTMLInputElement>('input[name="token_hash"]');
    const typeInput = container.querySelector<HTMLInputElement>('input[name="type"]');
    expect(tokenInput?.type).toBe("hidden");
    expect(tokenInput?.value).toBe("abc123");
    expect(typeInput?.value).toBe("recovery");
  });

  it("asks a signed-in person to sign out first and shows no password form", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "lead@example.com" } } });
    const { container } = await renderPage({ token_hash: "abc123", type: "recovery" });

    expect(screen.getByText(/already signed in/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out and continue" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Set password" })).toBeNull();
    expect(container.querySelector('input[name="token_hash"]')).toBeNull();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("shows a plain message and no form when the link is missing its code", async () => {
    await renderPage({});

    expect(screen.queryByRole("button", { name: "Set password" })).toBeNull();
    expect(screen.getByText(/missing its code/i)).toBeTruthy();
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
