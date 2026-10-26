import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { addClean, moveClean, skipClean, removeClean, unskipClean, refresh } = vi.hoisted(() => ({
  addClean: vi.fn(),
  moveClean: vi.fn(),
  skipClean: vi.fn(),
  removeClean: vi.fn(),
  unskipClean: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/(app)/cleaning/week-actions", () => ({ addClean, moveClean, skipClean, removeClean, unskipClean }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import {
  buildPullItems,
  buildWeekView,
  trayRows,
  type BoardAssignment,
  type BoardItem,
  type BoardZone,
} from "@/app/(app)/cleaning/board-view";
import type { PlanItem } from "@/app/(app)/cleaning/week-logic";
import { WeekBoard } from "@/components/cleaning/week-board";

const WEEK = "2026-10-26"; // Monday
const TODAY = "2026-10-28"; // Wednesday
const OK = { ok: true, data: undefined };

const GREEN: BoardZone = { id: "z-green", name: "Green", color: "#16A34A", side: "boh", sort: 1 };
const BLUE: BoardZone = { id: "z-blue", name: "Blue", color: "#1D4ED8", side: "boh", sort: 3 };
const ZONES = [GREEN, BLUE];

type FullItem = BoardItem & { half: string; days_of_week: number[] | null; interval_weeks: number | null };
const ITEMS: FullItem[] = [
  { id: "c1", name: "Boards deep clean", zone_id: GREEN.id, kind: "constant", sort: 0, half: "pm", days_of_week: [3], interval_weeks: null },
  { id: "v1", name: "Hood filters", zone_id: GREEN.id, kind: "variable", sort: 0, half: "either", days_of_week: null, interval_weeks: 4 },
  { id: "v2", name: "Vent above boards", zone_id: BLUE.id, kind: "variable", sort: 0, half: "am", days_of_week: null, interval_weeks: 2 },
  { id: "v3", name: "Dish rack", zone_id: BLUE.id, kind: "variable", sort: 1, half: "either", days_of_week: null, interval_weeks: 6 },
];

function row(id: string, itemId: string, date: string, half: "am" | "pm", over: Partial<BoardAssignment> = {}): BoardAssignment {
  return { id, item_id: itemId, date, half, origin: "auto", status: "planned", skip_reason: null, ...over };
}

const ASSIGNMENTS: BoardAssignment[] = [
  row("a-c1", "c1", "2026-10-28", "pm", { origin: "constant" }),
  row("a-v1", "v1", "2026-10-28", "pm"),
  row("a-v2", "v2", "2026-10-28", "am", { origin: "carry_over" }),
  row("a-v3", "v3", "2026-10-29", "am", { origin: "manual" }),
  row("a-done", "v1", "2026-10-27", "am", { status: "done" }),
];

const CAPS = Object.fromEntries(
  [1, 2, 3, 4, 5, 6].flatMap((d) => [
    [`${d}|am`, 1],
    [`${d}|pm`, 1],
  ]),
);

const PLAN_ITEMS: PlanItem[] = ITEMS.map((i) => ({
  id: i.id,
  name: i.name,
  kind: i.kind as "constant" | "variable",
  days_of_week: i.days_of_week,
  half: i.half as "am" | "pm" | "either",
  interval_weeks: i.interval_weeks,
  start_on: null,
  sort: i.sort,
}));

function renderBoard(over: Partial<Parameters<typeof WeekBoard>[0]> = {}) {
  const days = buildWeekView({ weekStart: WEEK, assignments: ASSIGNMENTS, items: ITEMS, zones: ZONES, caps: CAPS });
  return render(
    <WeekBoard
      weekStart={WEEK}
      today={TODAY}
      initialWeekday={3}
      canPlan
      days={days}
      tray={trayRows(["v3"], ITEMS, ZONES)}
      pullItems={buildPullItems(PLAN_ITEMS, ITEMS, ZONES)}
      onBoardItemIds={["c1", "v1", "v2", "v3"]}
      {...over}
    />,
  );
}

beforeEach(() => {
  for (const mock of [addClean, moveClean, skipClean, removeClean, unskipClean, refresh]) mock.mockReset();
  addClean.mockResolvedValue(OK);
  window.history.replaceState(null, "", "/cleaning/week");
});
afterEach(cleanup);

describe("the day chips", () => {
  it("shows Monday to Saturday with a count each, skipped cleans left out", () => {
    renderBoard();
    const group = screen.getByRole("group", { name: "Day of the week" });
    const labels = within(group)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Monday, Oct 26, 0 cleans",
      "Tuesday, Oct 27, 1 clean",
      "Wednesday, Oct 28, 3 cleans",
      "Thursday, Oct 29, 1 clean",
      "Friday, Oct 30, 0 cleans",
      "Saturday, Oct 31, 0 cleans",
    ]);
  });

  it("opens on the day it was given and marks it pressed", () => {
    renderBoard({ initialWeekday: 3 });
    expect(screen.getByRole("button", { name: /Wednesday, Oct 28/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Wednesday, Oct 28" })).toBeInTheDocument();
  });

  it("switches day in place and keeps the day in the address", () => {
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: /Thursday, Oct 29/ }));
    expect(screen.getByRole("heading", { name: "Thursday, Oct 29" })).toBeInTheDocument();
    // Dish rack is also in the tray, so look inside the day's own AM section.
    expect(within(screen.getByRole("region", { name: "AM cleans" })).getByText("Dish rack")).toBeInTheDocument();
    expect(screen.queryByText("Hood filters")).not.toBeInTheDocument();
    expect(window.location.search).toBe("?day=4");
  });
});

describe("a day's sections", () => {
  it("lists AM then PM, with constants before variables", () => {
    renderBoard();
    const am = screen.getByRole("region", { name: "AM cleans" });
    const pm = screen.getByRole("region", { name: "PM cleans" });
    expect(within(am).getByText("Vent above boards")).toBeInTheDocument();
    const names = within(pm)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(names[0]).toContain("Boards deep clean");
    expect(names[1]).toContain("Hood filters");
  });

  it("shows origin tags and zone names on the cards", () => {
    renderBoard();
    expect(screen.getByText("Carried over")).toBeInTheDocument();
    expect(screen.getAllByText("Green").length).toBeGreaterThan(0);
  });

  it("shows each half's variable load against its cap, and flags a slot that is over", () => {
    const stuffed = [...ASSIGNMENTS, row("a-extra", "v3", "2026-10-28", "pm", { origin: "manual" })];
    const days = buildWeekView({ weekStart: WEEK, assignments: stuffed, items: ITEMS, zones: ZONES, caps: CAPS });
    renderBoard({ days });
    expect(within(screen.getByRole("region", { name: "AM cleans" })).getByText("Variables 1 of 1")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "PM cleans" })).getByText("Variables 2 of 1, over the cap"),
    ).toBeInTheDocument();
  });

  it("says so when a half has nothing planned", () => {
    renderBoard({ initialWeekday: 1 });
    expect(screen.getAllByText("Nothing planned.")).toHaveLength(2);
  });
});

describe("a planner", () => {
  it("opens the options sheet by tapping a planned card", () => {
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: /Hood filters/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move to another day or half" })).toBeInTheDocument();
  });

  it("cannot open a clean that is already done", () => {
    renderBoard({ initialWeekday: 2 });
    expect(screen.getByText("Hood filters")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hood filters/ })).not.toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("refreshes the board after a change", async () => {
    moveClean.mockResolvedValue(OK);
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: /Hood filters/ }));
    fireEvent.click(screen.getByRole("button", { name: "Move to another day or half" }));
    fireEvent.click(screen.getByRole("button", { name: "Fri 30" }));
    fireEvent.click(screen.getByRole("button", { name: "Move here" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(moveClean).toHaveBeenCalledWith({ id: "a-v1", date: "2026-10-30", half: "pm" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("adds a tray item to the selected day and half", async () => {
    renderBoard();
    const tray = screen.getByRole("region", { name: "Due, not placed" });
    expect(within(tray).getByText("Dish rack")).toBeInTheDocument();

    fireEvent.click(within(tray).getByRole("button", { name: "Add to Wed PM: Dish rack" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(addClean).toHaveBeenCalledWith({ itemId: "v3", date: "2026-10-28", half: "pm" });
  });

  it("follows the selected day when adding from the tray", async () => {
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: /Friday, Oct 30/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add to Fri AM: Dish rack" }));
    await waitFor(() => expect(addClean).toHaveBeenCalledWith({ itemId: "v3", date: "2026-10-30", half: "am" }));
  });

  it("shows the server's message when an add is refused", async () => {
    addClean.mockResolvedValue({ ok: false, error: "That item is already in that slot." });
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: "Add to Wed AM: Dish rack" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That item is already in that slot.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("disables tray adds on a day that already passed", () => {
    renderBoard({ initialWeekday: 2 });
    expect(screen.getByRole("button", { name: "Add to Tue AM: Dish rack" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add to Tue PM: Dish rack" })).toBeDisabled();
  });
});

describe("pull from master list", () => {
  it("searches the active items and adds one to the selected day and half", async () => {
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: "Pull from master list" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Hood filters")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole("searchbox"), { target: { value: "vent" } });
    expect(within(dialog).queryByText("Hood filters")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Vent above boards")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Add Vent above boards to Wed Oct 28 PM" }));
    await waitFor(() => expect(addClean).toHaveBeenCalledWith({ itemId: "v2", date: "2026-10-28", half: "pm" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    // The picker stays open for the next item.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("flags items that are already on the week's board", () => {
    renderBoard();
    fireEvent.click(screen.getByRole("button", { name: "Pull from master list" }));
    expect(within(screen.getByRole("dialog")).getAllByText(/Already on this week/).length).toBeGreaterThan(0);
  });
});

describe("a leader (read only)", () => {
  it("sees the board but has no way to change it", () => {
    renderBoard({ canPlan: false, pullItems: [] });
    expect(screen.getByText("Hood filters")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hood filters/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pull from master list" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add to/ })).not.toBeInTheDocument();
    // The tray is information for everyone.
    expect(within(screen.getByRole("region", { name: "Due, not placed" })).getByText("Dish rack")).toBeInTheDocument();
  });
});
