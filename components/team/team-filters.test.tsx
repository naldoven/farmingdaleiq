import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/team",
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams("dayPartId=dp-1&side=foh"),
}));

import { TeamFilters } from "./team-filters";

const dayParts = [
  { id: "dp-1", name: "Breakfast" },
  { id: "dp-2", name: "Lunch" },
];

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe("TeamFilters", () => {
  it("marks the selected side and day-part chips active", () => {
    render(<TeamFilters dayParts={dayParts} selectedDayPartId="dp-1" selectedSide="foh" />);

    expect(screen.getByRole("button", { name: "FOH" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "BOH" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Breakfast" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Lunch" })).toHaveAttribute("aria-pressed", "false");
  });

  it("navigates with an updated side param when BOH is clicked", () => {
    render(<TeamFilters dayParts={dayParts} selectedDayPartId="dp-1" selectedSide="foh" />);

    fireEvent.click(screen.getByRole("button", { name: "BOH" }));

    expect(push).toHaveBeenCalledWith("/team?dayPartId=dp-1&side=boh");
  });

  it("navigates with an updated dayPartId param when a day-part chip is clicked", () => {
    render(<TeamFilters dayParts={dayParts} selectedDayPartId="dp-1" selectedSide="foh" />);

    fireEvent.click(screen.getByRole("button", { name: "Lunch" }));

    expect(push).toHaveBeenCalledWith("/team?dayPartId=dp-2&side=foh");
  });

  it("renders Today as a fixed, disabled chip rather than a toggle", () => {
    render(<TeamFilters dayParts={dayParts} selectedDayPartId="dp-1" selectedSide="foh" />);

    const today = screen.getByRole("button", { name: "Today" });
    expect(today).toBeDisabled();
  });
});
