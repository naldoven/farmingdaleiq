import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { resetNavPrefsCacheForTests } from "@/lib/nav/nav-prefs";

import { Sidebar } from "./sidebar";

const user = { name: "Dana Cruz", roleName: "Team Lead" };

beforeEach(() => {
  window.localStorage.clear();
  resetNavPrefsCacheForTests();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetNavPrefsCacheForTests();
});

describe("Sidebar collapse", () => {
  it("starts expanded with the wordmark and user footer", () => {
    render(<Sidebar user={user} />);

    expect(screen.getByRole("link", { name: "FarmingdaleIQ home" })).toBeInTheDocument();
    expect(screen.getByText("Dana Cruz")).toBeInTheDocument();
    expect(screen.getByText("Team Lead")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse menu" })).toBeInTheDocument();
  });

  it("collapses to the icon rail when the toggle is clicked", () => {
    render(<Sidebar user={user} />);

    fireEvent.click(screen.getByRole("button", { name: "Collapse menu" }));

    // The toggle flips, and the wordmark plus the text footer give up their room.
    expect(screen.getByRole("button", { name: "Expand menu" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "FarmingdaleIQ home" })).not.toBeInTheDocument();
    expect(screen.queryByText("Team Lead")).not.toBeInTheDocument();
    // Nav becomes the icon rail; the avatar stays as the profile link.
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Dana Cruz/ })).toHaveAttribute("href", "/people");
  });

  it("restores the full sidebar when toggled back", () => {
    render(<Sidebar user={user} />);

    fireEvent.click(screen.getByRole("button", { name: "Collapse menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand menu" }));

    expect(screen.getByRole("link", { name: "FarmingdaleIQ home" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("remembers the collapsed choice across mounts", () => {
    const first = render(<Sidebar user={user} />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse menu" }));
    first.unmount();

    // A fresh mount reads the persisted preference, as a page navigation would.
    render(<Sidebar user={user} />);
    expect(screen.getByRole("button", { name: "Expand menu" })).toBeInTheDocument();
  });
});
