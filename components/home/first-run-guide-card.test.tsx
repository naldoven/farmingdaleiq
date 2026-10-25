import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetGuidePrefsCacheForTests } from "@/lib/guide/guide-prefs";

import { FirstRunGuideCard } from "./first-run-guide-card";

const STORAGE_KEY = "fiq.guide.dismissed.v1";

beforeEach(() => {
  window.localStorage.clear();
  resetGuidePrefsCacheForTests();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetGuidePrefsCacheForTests();
});

describe("FirstRunGuideCard", () => {
  it("links to the guide with its title and description", () => {
    render(<FirstRunGuideCard />);

    const link = screen.getByRole("link", { name: /New here\? Start with the guide/ });
    expect(link).toHaveAttribute("href", "/guide");
    expect(screen.getByText("Five steps for your first shift.")).toBeInTheDocument();
  });

  it("hides the card and writes the storage key when Dismiss is clicked", () => {
    render(<FirstRunGuideCard />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("link", { name: /Start with the guide/ })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1");
  });

  it("stays hidden on a fresh mount once dismissed", () => {
    window.localStorage.setItem(STORAGE_KEY, "1");

    render(<FirstRunGuideCard />);

    expect(screen.queryByRole("link", { name: /Start with the guide/ })).not.toBeInTheDocument();
  });
});
