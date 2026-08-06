import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockNavigation = vi.hoisted(() => ({ pathname: "/" }));
const mockBack = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => mockNavigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: mockBack }),
}));

import { AppShell } from "./app-shell";

const user = { name: "Dana Cruz", email: "dana@example.com", roleName: "Team Lead" };

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  mockNavigation.pathname = "/";
  mockBack.mockClear();
  // JSDOM's window.history is a single global shared across every test in
  // this file; without resetting it, a later test would see whatever idx
  // an earlier test's pushState left behind (see useSmartBack.ts).
  window.history.replaceState(null, "");
});

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

  it("renders a desktop back link for sub-pages that mobile already treats as backable", () => {
    mockNavigation.pathname = "/checklists/templates";

    render(
      <AppShell user={user} layout="desktop">
        <p>content</p>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/checklists");
  });

  it("does not add a desktop back link on primary tab routes", () => {
    mockNavigation.pathname = "/tasks";

    render(
      <AppShell user={user} layout="desktop">
        <p>content</p>
      </AppShell>,
    );

    expect(screen.queryByRole("link", { name: "Back" })).not.toBeInTheDocument();
  });

  it("uses real browser history for Back when in-app history exists, instead of the computed parent link", () => {
    // Simulates having actually navigated within the app this tab (see
    // useSmartBack.ts: idx > 0 is the signal there's somewhere real to
    // return to, rather than only a guessed parent URL).
    window.history.pushState({ idx: 1 }, "");
    mockNavigation.pathname = "/checklists/templates";

    render(
      <AppShell user={user} layout="desktop">
        <p>content</p>
      </AppShell>,
    );

    const back = screen.getByRole("button", { name: "Back" });
    expect(back).not.toHaveAttribute("href");
    fireEvent.click(back);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("falls back to the computed parent link when there is no in-app history (e.g. a fresh page load)", () => {
    mockNavigation.pathname = "/checklists/templates";

    render(
      <AppShell user={user} layout="desktop">
        <p>content</p>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/checklists");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("also uses real browser history for the mobile header's back chevron", () => {
    window.history.pushState({ idx: 2 }, "");
    mockNavigation.pathname = "/checklists/templates";

    render(
      <AppShell user={user} layout="mobile">
        <p>content</p>
      </AppShell>,
    );

    const back = screen.getByRole("button", { name: "Back" });
    fireEvent.click(back);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("lets mobile users long-press the Menu tab to go back from a sub-page", () => {
    vi.useFakeTimers();
    window.history.pushState({ idx: 2 }, "");
    mockNavigation.pathname = "/catering/history";

    render(
      <AppShell user={user} layout="mobile">
        <p>content</p>
      </AppShell>,
    );

    const menu = screen.getByRole("link", { name: "Menu" });
    fireEvent.pointerDown(menu);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockBack).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(menu);
    vi.useRealTimers();
  });

  it("keeps a normal mobile Menu tap as navigation, not Back", () => {
    vi.useFakeTimers();
    window.history.pushState({ idx: 2 }, "");
    mockNavigation.pathname = "/catering/history";

    render(
      <AppShell user={user} layout="mobile">
        <p>content</p>
      </AppShell>,
    );

    const menu = screen.getByRole("link", { name: "Menu" });
    fireEvent.pointerDown(menu);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.pointerUp(menu);

    expect(menu).toHaveAttribute("href", "/menu");
    expect(mockBack).not.toHaveBeenCalled();
  });
});
