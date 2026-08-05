import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { resetNavPrefsCacheForTests } from "@/lib/nav/nav-prefs";

import { NavLinks } from "./nav-links";

beforeEach(() => {
  pathname.current = "/";
  window.localStorage.clear();
  resetNavPrefsCacheForTests();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetNavPrefsCacheForTests();
});

describe("NavLinks expanded", () => {
  it("renders a single-destination group as a plain link, not an accordion", () => {
    render(<NavLinks />);

    const waste = screen.getByRole("link", { name: "Waste" });
    expect(waste).toHaveAttribute("href", "/waste");
    // No disclosure control for a section with nothing to disclose.
    expect(screen.queryByRole("button", { name: /^Waste/ })).not.toBeInTheDocument();
  });

  it("renders a multi-destination group as a collapsed accordion", () => {
    render(<NavLinks />);

    const catering = screen.getByRole("button", { name: /Catering/ });
    expect(catering).toHaveAttribute("aria-expanded", "false");
    // Its pages are not in the DOM until it is opened.
    expect(screen.queryByRole("link", { name: "Confirmation Calls" })).not.toBeInTheDocument();
  });

  it("keeps the resting nav short by collapsing every inactive section", () => {
    render(<NavLinks />);

    // Flat, this map is ~35 destinations. Collapsed, only the single-item
    // groups plus the active section's pages are rendered as links.
    const links = screen.getAllByRole("link");
    expect(links.length).toBeLessThan(20);
  });

  it("opens the group holding the current route so you can see where you are", () => {
    pathname.current = "/catering/confirm";
    render(<NavLinks />);

    expect(screen.getByRole("button", { name: /Catering/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const active = screen.getByRole("link", { name: "Confirmation Calls" });
    expect(active).toHaveAttribute("aria-current", "page");
    // A different section stays shut.
    expect(screen.getByRole("button", { name: /Training/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("reveals a section's pages when its header is clicked", () => {
    render(<NavLinks />);

    fireEvent.click(screen.getByRole("button", { name: /Catering/ }));

    expect(screen.getByRole("link", { name: "Confirmation Calls" })).toHaveAttribute(
      "href",
      "/catering/confirm",
    );
    expect(screen.getByRole("button", { name: /Catering/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("lets the user close the section they are currently in", () => {
    pathname.current = "/catering/confirm";
    render(<NavLinks />);

    fireEvent.click(screen.getByRole("button", { name: /Catering/ }));

    expect(screen.getByRole("button", { name: /Catering/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("link", { name: "Confirmation Calls" })).not.toBeInTheDocument();
  });

  it("highlights only the deepest matching page, not its section landing page", () => {
    pathname.current = "/catering/confirm";
    render(<NavLinks />);

    // Prefix matching also matches "/catering" (Pipeline). Only one may be current.
    expect(screen.getByRole("link", { name: "Confirmation Calls" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Pipeline" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getAllByRole("link").filter((l) => l.getAttribute("aria-current"))).toHaveLength(1);
  });

  it("falls back to the section landing page on an unmapped detail route", () => {
    pathname.current = "/catering/orders/abc-123";
    render(<NavLinks />);

    expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("hides gated destinations the user cannot reach (S4)", () => {
    render(<NavLinks allowedPermissions={[]} />);

    // Settings has two gated items, so the whole group drops out.
    expect(screen.queryByRole("button", { name: /Settings/ })).not.toBeInTheDocument();
    // Ungated single-item groups survive.
    expect(screen.getByRole("link", { name: "Accountability" })).toBeInTheDocument();
  });

  it("collapses a group to a link when gating leaves it one reachable page", () => {
    render(<NavLinks allowedPermissions={["settings.manage"]} />);

    // Only /settings survives its group, so it renders as a direct link.
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
    expect(screen.queryByRole("button", { name: /Settings/ })).not.toBeInTheDocument();
  });
});

describe("NavLinks collapsed rail", () => {
  it("renders one icon control per section and no text labels", () => {
    render(<NavLinks collapsed />);

    const rail = screen.getByRole("navigation", { name: "Sections" });
    expect(rail).toBeInTheDocument();
    // Single-destination sections navigate straight there.
    expect(screen.getByRole("link", { name: "Waste" })).toHaveAttribute("href", "/waste");
    // No sub-page links have room in the rail.
    expect(screen.queryByRole("link", { name: "Confirmation Calls" })).not.toBeInTheDocument();
  });

  it("marks the section containing the current route as active", () => {
    pathname.current = "/waste";
    render(<NavLinks collapsed />);

    expect(screen.getByRole("link", { name: "Waste" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("expands the sidebar onto a multi-page section when its icon is clicked", () => {
    const { rerender } = render(<NavLinks collapsed />);

    fireEvent.click(screen.getByRole("button", { name: /Catering — expand menu/ }));

    // The click writes collapsed:false; the sidebar owns that prop, so re-render
    // as the sidebar would and assert the section landed open.
    rerender(<NavLinks />);
    expect(screen.getByRole("button", { name: /Catering/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("link", { name: "Confirmation Calls" })).toBeInTheDocument();
  });
});
