import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BottomTabBar } from "./bottom-tab-bar";
import { PRIMARY_TABS } from "@/lib/nav/page-map";

afterEach(cleanup);

describe("BottomTabBar", () => {
  it("renders exactly four tabs in order: Home, Team, Tasks, Menu", () => {
    render(<BottomTabBar pathname="/" onMenuClick={vi.fn()} />);

    expect(PRIMARY_TABS.map((t) => t.label)).toEqual(["Home", "Team", "Tasks", "Menu"]);

    const nav = screen.getByRole("navigation", { name: "Primary" });
    const labels = Array.from(nav.querySelectorAll("span")).map((el) => el.textContent);
    expect(labels).toEqual(["Home", "Team", "Tasks", "Menu"]);
  });

  it("routes the Tasks tab to /tasks", () => {
    render(<BottomTabBar pathname="/" onMenuClick={vi.fn()} />);
    expect(screen.getByText("Tasks").closest("a")).toHaveAttribute("href", "/tasks");
  });

  it("marks Tasks active on /tasks and its sub-routes", () => {
    render(<BottomTabBar pathname="/tasks" onMenuClick={vi.fn()} />);
    expect(screen.getByText("Tasks").closest("a")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Home").closest("a")).not.toHaveAttribute("aria-current");

    cleanup();

    render(<BottomTabBar pathname="/tasks/123" onMenuClick={vi.fn()} />);
    expect(screen.getByText("Tasks").closest("a")).toHaveAttribute("aria-current", "page");
  });

  it("does not mark Tasks active on unrelated routes", () => {
    render(<BottomTabBar pathname="/team" onMenuClick={vi.fn()} />);
    expect(screen.getByText("Tasks").closest("a")).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Team").closest("a")).toHaveAttribute("aria-current", "page");
  });

  it("keeps Menu as a button (drawer trigger), not a link, and marks it active when the drawer is open", () => {
    const onMenuClick = vi.fn();
    render(<BottomTabBar pathname="/somewhere" onMenuClick={onMenuClick} menuOpen />);

    const menuButton = screen.getByText("Menu").closest("button");
    expect(menuButton).toBeInTheDocument();
    expect(menuButton).toHaveAttribute("aria-current", "page");
  });
});
