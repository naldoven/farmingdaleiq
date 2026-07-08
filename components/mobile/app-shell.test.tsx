import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { AppShell } from "./app-shell";

const user = { name: "Dana Cruz", email: "dana@example.com", roleName: "Team Lead" };

afterEach(cleanup);

describe("AppShell responsive nav", () => {
  it("renders the bottom tab bar (and no desktop sidebar) in mobile layout", () => {
    render(
      <AppShell user={user} layout="mobile">
        <p>content</p>
      </AppShell>,
    );

    // The fixed bottom tab bar is the "Primary" navigation with a Menu control.
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByText("Menu")).toBeInTheDocument();
    // The desktop sidebar footer (its Sign out button) is not present.
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });

  it("renders the desktop sidebar (and no bottom tab bar) in desktop layout", () => {
    render(
      <AppShell user={user} layout="desktop">
        <p>content</p>
      </AppShell>,
    );

    // Sidebar footer sign-out proves the sidebar rendered.
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    // No mobile bottom tab bar.
    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
  });

  it("shows the store location pill in the mobile home header", () => {
    render(
      <AppShell user={user} layout="mobile" storeName="Farmingdale" storeAddress="1991 Broadhollow Rd">
        <p>content</p>
      </AppShell>,
    );

    // "Farmingdale" also appears in the wordmark, so scope to the unique address.
    expect(screen.getByText(/1991 Broadhollow Rd/)).toBeInTheDocument();
    expect(screen.getAllByText("Farmingdale").length).toBeGreaterThan(0);
  });
});
