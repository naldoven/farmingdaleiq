import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/cleaning/finds-actions", () => ({ convertFind: vi.fn(), deleteFind: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import type { FindCard } from "@/app/(app)/cleaning/finds-view";
import { FindFeed } from "@/components/cleaning/find-feed";

afterEach(cleanup);

const ZONES = [{ id: "z1", name: "Fryer line", color: "#E51636", side: "boh" }];

function card(overrides: Partial<FindCard> = {}): FindCard {
  return {
    id: "f1",
    zoneId: "z1",
    zoneName: "Fryer line",
    zoneColor: "#E51636",
    note: "Grease behind the fryer",
    postedBy: "Maria",
    postedText: "Posted Mon Oct 26, 3:42 PM by Maria",
    photoUrl: "https://signed/f1",
    photoMissing: false,
    itemHref: null,
    canConvert: false,
    canDelete: false,
    ...overrides,
  };
}

describe("FindFeed", () => {
  it("says what to do when there are no finds", () => {
    render(<FindFeed cards={[]} zones={ZONES} />);
    expect(screen.getByText(/No finds yet/)).toBeInTheDocument();
  });

  it("shows the thumbnail, area, note and who and when", () => {
    render(<FindFeed cards={[card()]} zones={ZONES} />);
    const item = screen.getByRole("listitem");
    expect(within(item).getByText("Fryer line")).toBeInTheDocument();
    expect(within(item).getByText("Grease behind the fryer")).toBeInTheDocument();
    expect(within(item).getByText("Posted Mon Oct 26, 3:42 PM by Maria")).toBeInTheDocument();
    const link = within(item).getByRole("link", { name: "Open the photo: Grease behind the fryer" });
    expect(link).toHaveAttribute("href", "https://signed/f1");
  });

  it("marks a photo whose link did not come back", () => {
    render(<FindFeed cards={[card({ photoUrl: null, photoMissing: true })]} zones={ZONES} />);
    expect(screen.getByText("Photo unavailable")).toBeInTheDocument();
  });

  it("links a find that became an item, and offers no planner buttons on it", () => {
    render(<FindFeed cards={[card({ itemHref: "/cleaning/items/item-9" })]} zones={ZONES} />);
    expect(screen.getByRole("link", { name: "On the master list" })).toHaveAttribute("href", "/cleaning/items/item-9");
    expect(screen.queryByRole("button", { name: /Add to master list/ })).not.toBeInTheDocument();
  });

  it("gives a planner Add and Delete on an open find", () => {
    render(<FindFeed cards={[card({ canConvert: true, canDelete: true })]} zones={ZONES} />);
    expect(screen.getByRole("button", { name: /^Add to master list/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Delete find/ })).toBeInTheDocument();
  });

  it("gives a leader who is not a planner no buttons to change anything", () => {
    render(<FindFeed cards={[card()]} zones={ZONES} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
