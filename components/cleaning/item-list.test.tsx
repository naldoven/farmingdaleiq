import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/cleaning/actions", () => ({
  approveItem: vi.fn(),
  deleteDraftItem: vi.fn(),
  retireItem: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { ItemList, type ItemListRow, type ItemListZone } from "@/components/cleaning/item-list";

const ZONE: ItemListZone = { id: "zone-1", name: "Green", color: "#16a34a", side: "boh", sort: 1 };

function row(overrides: Partial<ItemListRow> & { id: string; name: string }): ItemListRow {
  return {
    zone_id: ZONE.id,
    status: "active",
    cadence: "Every 2 weeks, AM or PM",
    ifNeeded: false,
    photoUrl: null,
    photoMissing: false,
    markup: null,
    dueState: null,
    dueStateText: null,
    dueLabel: null,
    lastCleanedLabel: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe("ItemList due dots", () => {
  it("shows a red, yellow or green dot with its meaning in words and the next due date", () => {
    render(
      <ItemList
        zones={[ZONE]}
        canPlan={false}
        rows={[
          row({
            id: "a",
            name: "Vent above boards",
            dueState: "overdue",
            dueStateText: "Overdue",
            dueLabel: "Next due Oct 12, 2026",
            lastCleanedLabel: "Last cleaned Sep 28, 2026",
          }),
          row({
            id: "b",
            name: "Lowboy gaskets",
            dueState: "due_this_week",
            dueStateText: "Due this week",
            dueLabel: "Next due Oct 30, 2026",
            lastCleanedLabel: "Last cleaned Oct 16, 2026",
          }),
          row({
            id: "c",
            name: "Freezer floor",
            dueState: "not_due",
            dueStateText: "Not due yet",
            dueLabel: "Next due Nov 23, 2026",
            lastCleanedLabel: "Last cleaned Oct 26, 2026",
          }),
        ]}
      />,
    );

    expect(screen.getByRole("img", { name: "Overdue" })).toHaveClass("bg-danger");
    expect(screen.getByRole("img", { name: "Due this week" })).toHaveClass("bg-warning");
    expect(screen.getByRole("img", { name: "Not due yet" })).toHaveClass("bg-success");
    expect(screen.getByText("Next due Oct 12, 2026")).toBeInTheDocument();
    expect(screen.getByText("Last cleaned Sep 28, 2026")).toBeInTheDocument();
  });

  it("reads 'Due now' for an item with no clean and no start date", () => {
    render(
      <ItemList
        zones={[ZONE]}
        canPlan={false}
        rows={[
          row({
            id: "a",
            name: "Hood filters",
            dueState: "overdue",
            dueStateText: "Overdue",
            dueLabel: "Due now",
            lastCleanedLabel: "Never cleaned yet",
          }),
        ]}
      />,
    );
    expect(screen.getByText("Due now")).toBeInTheDocument();
    expect(screen.getByText("Never cleaned yet")).toBeInTheDocument();
  });

  it("gives a constant its last-cleaned date and no dot", () => {
    render(
      <ItemList
        zones={[ZONE]}
        canPlan={false}
        rows={[row({ id: "a", name: "Boards deep clean", cadence: "Tue, Fri PM", lastCleanedLabel: "Last cleaned Oct 20, 2026" })]}
      />,
    );
    expect(screen.getByText("Last cleaned Oct 20, 2026")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /overdue|due this week|not due/i })).not.toBeInTheDocument();
  });

  it("shows a draft with neither a dot nor a last-cleaned line", () => {
    render(<ItemList zones={[ZONE]} canPlan={false} rows={[row({ id: "a", name: "New vent", status: "draft" })]} />);
    expect(screen.getByText("New vent")).toBeInTheDocument();
    expect(screen.queryByText(/last cleaned|never cleaned/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /overdue|due this week|not due/i })).not.toBeInTheDocument();
  });
});
