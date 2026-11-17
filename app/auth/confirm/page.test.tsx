import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const confirmSetupLink = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp } }),
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
    confirmSetupLink.mockReset();
  });

  it("does nothing to the token on page load, so a text or email preview cannot use it up", async () => {
    const { container } = await renderPage({ token_hash: "abc123", type: "recovery" });

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(confirmSetupLink).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();

    const tokenInput = container.querySelector<HTMLInputElement>('input[name="token_hash"]');
    const typeInput = container.querySelector<HTMLInputElement>('input[name="type"]');
    expect(tokenInput?.type).toBe("hidden");
    expect(tokenInput?.value).toBe("abc123");
    expect(typeInput?.value).toBe("recovery");
  });

  it("shows a plain message and no button when the link is missing its code", async () => {
    await renderPage({});

    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.getByText(/missing its code/i)).toBeTruthy();
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
