import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildWeekView,
  type BoardAssignment,
  type BoardItem,
  type BoardZone,
} from "@/app/(app)/cleaning/board-view";
import { PrintSheet } from "@/components/cleaning/print-sheet";

const WEEK = "2026-10-26"; // Monday
const GREEN: BoardZone = { id: "z-green", name: "Green", color: "#16A34A", side: "boh", sort: 1 };
const BLUE: BoardZone = { id: "z-blue", name: "Blue", color: "#1D4ED8", side: "boh", sort: 3 };

const ITEMS: BoardItem[] = [
  { id: "c1", name: "Boards deep clean", zone_id: GREEN.id, kind: "constant", sort: 0 },
  { id: "v1", name: "Vent above boards", zone_id: BLUE.id, kind: "variable", sort: 0 },
  { id: "v2", name: "Hood filters", zone_id: GREEN.id, kind: "variable", sort: 0 },
];

function row(id: string, itemId: string, date: string, half: "am" | "pm", origin: BoardAssignment["origin"] = "auto"): BoardAssignment {
  return { id, item_id: itemId, date, half, origin, status: "planned", skip_reason: null };
}

afterEach(cleanup);

function renderSheet() {
  const days = buildWeekView({
    weekStart: WEEK,
    assignments: [
      row("a1", "v1", WEEK, "am"),
      row("a2", "c1", WEEK, "am", "constant"),
      row("a3", "v2", "2026-10-31", "pm"),
    ],
    items: ITEMS,
    zones: [GREEN, BLUE],
    caps: {},
  });
  render(
    <PrintSheet
      rangeLabel="Oct 26 to Oct 31, 2026"
      sideLabel="Back of house"
      days={days}
      legend={[
        { id: GREEN.id, name: "Green", color: GREEN.color },
        { id: BLUE.id, name: "Blue", color: BLUE.color },
      ]}
    />,
  );
}

describe("the printed sheet", () => {
  it("is titled and dated like the paper sheet", () => {
    renderSheet();
    expect(screen.getByRole("heading", { name: "Weekly Cleaning Schedule" })).toBeInTheDocument();
    expect(screen.getByText(/Back of house/)).toHaveTextContent("Oct 26 to Oct 31, 2026");
  });

  it("is one table: Mon to Sat across, AM and PM down", () => {
    renderSheet();
    const table = screen.getByRole("table");
    const columns = within(table).getAllByRole("columnheader");
    // The first column is the AM/PM label column.
    expect(columns.map((c) => c.textContent)).toEqual([
      "",
      "MonOct 26",
      "TueOct 27",
      "WedOct 28",
      "ThuOct 29",
      "FriOct 30",
      "SatOct 31",
    ]);
    expect(within(table).getAllByRole("rowheader").map((r) => r.textContent)).toEqual(["AM", "PM"]);
  });

  it("puts constants before variables in a cell, each in its zone's color", () => {
    renderSheet();
    const cells = within(screen.getByRole("table")).getAllByRole("cell");
    // Row AM, column Monday is the first body cell.
    const items = within(cells[0]!).getAllByRole("listitem");
    expect(items.map((i) => i.textContent)).toEqual(["Boards deep clean", "Vent above boards"]);
    expect(items[0]).toHaveStyle({ color: "rgb(22, 163, 74)" });
    expect(items[1]).toHaveStyle({ color: "rgb(29, 78, 216)" });
  });

  it("gives every clean an empty checkbox and an initials line", () => {
    renderSheet();
    const entry = screen.getByText("Hood filters").closest("li")!;
    const marks = entry.querySelectorAll('span[aria-hidden="true"]');
    expect(marks).toHaveLength(2);
    expect(marks[0]).toHaveClass("border");
    expect(marks[1]).toHaveClass("border-b");
    expect(entry.querySelector("input")).toBeNull();
  });

  it("lists the zone colors in a legend", () => {
    renderSheet();
    const legend = screen.getByRole("list", { name: "Zone colors" });
    expect(within(legend).getAllByRole("listitem").map((i) => i.textContent)).toEqual(["Green", "Blue"]);
  });
});
