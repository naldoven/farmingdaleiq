import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let mockPathname = "/guest-recovery";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

import { GuestRecoveryTabs } from "./section-tabs";

afterEach(cleanup);

describe("GuestRecoveryTabs", () => {
  it("gives Recoveries two tabs, Current and Stats, and marks the one you are on", () => {
    mockPathname = "/guest-recovery";
    render(<GuestRecoveryTabs group="recoveries" />);
    expect(screen.getByRole("link", { name: "Current" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Stats" })).toHaveAttribute("href", "/guest-recovery/reporting");
    expect(screen.getByRole("link", { name: "Stats" })).not.toHaveAttribute("aria-current");
  });

  it("marks Stats when you are on the stats page", () => {
    mockPathname = "/guest-recovery/reporting";
    render(<GuestRecoveryTabs group="recoveries" />);
    expect(screen.getByRole("link", { name: "Stats" })).toHaveAttribute("aria-current", "page");
  });

  it("shows no tabs at all to a leader who cannot see Stats, since one tab is not a choice", () => {
    mockPathname = "/guest-recovery";
    const { container } = render(<GuestRecoveryTabs group="recoveries" showStats={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps Menu items and Settings together under Menu & settings", () => {
    mockPathname = "/guest-recovery/menu/settings";
    render(<GuestRecoveryTabs group="setup" />);
    expect(screen.getByRole("link", { name: "Menu items" })).toHaveAttribute("href", "/guest-recovery/menu");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  });
});
