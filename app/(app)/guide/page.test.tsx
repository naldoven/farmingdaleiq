import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import GuidePage from "./page";

afterEach(cleanup);

describe("GuidePage", () => {
  it("shows five numbered steps under the page title", () => {
    render(<GuidePage />);

    expect(screen.getByRole("heading", { level: 1, name: "Your first shift" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(5);
  });

  it("keeps the body text short enough to scan on a phone", () => {
    const { container } = render(<GuidePage />);
    const words = Array.from(container.querySelectorAll("li p"))
      .map((p) => p.textContent ?? "")
      .join(" ")
      .split(/\s+/)
      .filter(Boolean);

    expect(words.length).toBeLessThan(120);
  });

  it("links into screens that exist and offers the dismiss button", () => {
    render(<GuidePage />);

    expect(screen.getByRole("link", { name: "Open Checklists" })).toHaveAttribute("href", "/checklists");
    expect(screen.getByRole("link", { name: "Open Menu" })).toHaveAttribute("href", "/menu");
    expect(screen.getByRole("button", { name: "Hide this from Home" })).toBeInTheDocument();
  });
});
