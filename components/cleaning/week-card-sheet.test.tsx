import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { moveClean, skipClean, removeClean, unskipClean } = vi.hoisted(() => ({
  moveClean: vi.fn(),
  skipClean: vi.fn(),
  removeClean: vi.fn(),
  unskipClean: vi.fn(),
}));

vi.mock("@/app/(app)/cleaning/week-actions", () => ({ moveClean, skipClean, removeClean, unskipClean }));

import type { BoardCard } from "@/app/(app)/cleaning/board-view";
import { WeekCardSheet } from "@/components/cleaning/week-card-sheet";

const OK = { ok: true, data: undefined };
const WEEK = "2026-10-26"; // Monday
const TODAY = "2026-10-28"; // Wednesday

function card(over: Partial<BoardCard> = {}): BoardCard {
  return {
    id: "a1111111-1111-4111-8111-111111111111",
    itemId: "i1",
    name: "Vent above boards",
    zoneId: "z1",
    zoneName: "Green",
    zoneColor: "#16A34A",
    zoneSide: "boh",
    zoneSort: 1,
    itemSort: 0,
    kind: "variable",
    date: "2026-10-29",
    half: "am",
    origin: "auto",
    status: "planned",
    skipReason: null,
    tags: [],
    ...over,
  };
}

function renderSheet(c: BoardCard) {
  const onClose = vi.fn();
  const onChanged = vi.fn();
  render(<WeekCardSheet card={c} weekStart={WEEK} today={TODAY} onClose={onClose} onChanged={onChanged} />);
  return { onClose, onChanged };
}

beforeEach(() => {
  for (const mock of [moveClean, skipClean, removeClean, unskipClean]) mock.mockReset().mockResolvedValue(OK);
});
afterEach(cleanup);

describe("a planned card", () => {
  it("offers move, skip and remove for a pulled-in extra", () => {
    renderSheet(card({ origin: "manual" }));
    expect(screen.getByRole("button", { name: "Move to another day or half" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip it" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove from this day" })).toBeInTheDocument();
  });

  it("never offers Remove for a constant, and says to skip it", () => {
    renderSheet(card({ origin: "constant", kind: "constant" }));
    expect(screen.queryByRole("button", { name: "Remove from this day" })).not.toBeInTheDocument();
    expect(screen.getByText(/can't be removed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip it" })).toBeInTheDocument();
  });
});

describe("skip", () => {
  it("needs a reason before the skip button works", async () => {
    const { onChanged } = renderSheet(card());
    fireEvent.click(screen.getByRole("button", { name: "Skip it" }));
    const confirm = screen.getByRole("button", { name: "Skip it" });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Reason for skipping"), { target: { value: "   " } });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Reason for skipping"), { target: { value: "  Walk-in being serviced " } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(skipClean).toHaveBeenCalledWith({ id: card().id, reason: "Walk-in being serviced" });
  });

  it("caps the reason at 200 characters", () => {
    renderSheet(card());
    fireEvent.click(screen.getByRole("button", { name: "Skip it" }));
    expect(screen.getByLabelText("Reason for skipping")).toHaveAttribute("maxlength", "200");
  });
});

describe("move", () => {
  it("keeps Move here off until the day or half changes, then sends it", async () => {
    const { onChanged } = renderSheet(card());
    fireEvent.click(screen.getByRole("button", { name: "Move to another day or half" }));
    const move = screen.getByRole("button", { name: "Move here" });
    expect(move).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Fri 30" }));
    fireEvent.click(screen.getByRole("button", { name: "PM" }));
    expect(move).toBeEnabled();
    fireEvent.click(move);

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(moveClean).toHaveBeenCalledWith({ id: card().id, date: "2026-10-30", half: "pm" });
  });

  it("disables days that already passed, because a clean there would close out as a miss", () => {
    renderSheet(card());
    fireEvent.click(screen.getByRole("button", { name: "Move to another day or half" }));
    expect(screen.getByRole("button", { name: "Mon 26" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tue 27" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Wed 28" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sat 31" })).toBeEnabled();
  });

  it("goes back to the menu without sending anything", () => {
    renderSheet(card());
    fireEvent.click(screen.getByRole("button", { name: "Move to another day or half" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Skip it" })).toBeInTheDocument();
    expect(moveClean).not.toHaveBeenCalled();
  });
});

describe("remove", () => {
  it("asks once, then removes", async () => {
    const { onChanged } = renderSheet(card({ origin: "manual" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from this day" }));
    expect(removeClean).not.toHaveBeenCalled();
    expect(screen.getByText(/stays on the master list/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(removeClean).toHaveBeenCalledWith({ id: card().id });
  });

  it("keeps the clean when the planner backs out", () => {
    renderSheet(card({ origin: "manual" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from this day" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(removeClean).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Skip it" })).toBeInTheDocument();
  });
});

describe("when the server refuses", () => {
  it("shows the message and does not close the sheet", async () => {
    moveClean.mockResolvedValue({ ok: false, error: "That item is already in that slot." });
    const { onChanged } = renderSheet(card());
    fireEvent.click(screen.getByRole("button", { name: "Move to another day or half" }));
    fireEvent.click(screen.getByRole("button", { name: "Thu 29" }));
    fireEvent.click(screen.getByRole("button", { name: "PM" }));
    fireEvent.click(screen.getByRole("button", { name: "Move here" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That item is already in that slot.");
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("a skipped card", () => {
  const skipped = card({
    status: "skipped",
    skipReason: "Walk-in being serviced",
    tags: [{ label: "Skipped: Walk-in being serviced", tone: "warning" }],
  });

  it("shows the reason and puts the clean back on the plan", async () => {
    const { onChanged } = renderSheet(skipped);
    expect(screen.getByText(/Walk-in being serviced/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip it" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Put back on the plan" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(unskipClean).toHaveBeenCalledWith({ id: skipped.id });
  });

  it("will not put back a clean from a day that passed", () => {
    renderSheet({ ...skipped, date: "2026-10-27" });
    expect(screen.getByRole("button", { name: "Put back on the plan" })).toBeDisabled();
  });
});
