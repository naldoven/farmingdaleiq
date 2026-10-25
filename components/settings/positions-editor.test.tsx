import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const reorderPositions = vi.hoisted(() => vi.fn());
const deletePosition = vi.hoisted(() => vi.fn());
const deletePositionGroup = vi.hoisted(() => vi.fn());

vi.mock("@/app/(app)/settings/positions/actions", () => ({
  createPosition: vi.fn(),
  createPositionGroup: vi.fn(),
  deletePosition,
  deletePositionGroup,
  renamePositionGroup: vi.fn(),
  reorderPositions,
  seedDefaultPositions: vi.fn(),
  setPositionRateable: vi.fn(),
  updatePosition: vi.fn(),
}));

import { PositionsEditor, type PositionGroupRow, type PositionRow } from "./positions-editor";

const BANNER = /Load the Avondale default list/;

const renamedGroups: PositionGroupRow[] = [{ id: "g1", name: "Counter (renamed)", sort: 0 }];
const twoPositions: PositionRow[] = [
  { id: "p1", group_id: "g1", name: "Register 1", sort: 0, is_rateable: true },
  { id: "p2", group_id: "g1", name: "Register 2", sort: 1, is_rateable: true },
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PositionsEditor default list banner", () => {
  it("shows in an empty store", () => {
    render(<PositionsEditor groups={[]} positions={[]} trainingStationIds={[]} />);
    expect(screen.getByRole("button", { name: BANNER })).toBeInTheDocument();
  });

  it("stays hidden once the seed groups are renamed, as long as positions exist", () => {
    render(<PositionsEditor groups={renamedGroups} positions={twoPositions} trainingStationIds={[]} />);
    expect(screen.queryByRole("button", { name: BANNER })).not.toBeInTheDocument();
  });

  it("stays hidden when groups carry the seed names and positions exist", () => {
    const seedNamed: PositionGroupRow[] = [
      { id: "g1", name: "Front Counter", sort: 0 },
      { id: "g2", name: "Drive Thru", sort: 1 },
    ];
    render(<PositionsEditor groups={seedNamed} positions={twoPositions} trainingStationIds={[]} />);
    expect(screen.queryByRole("button", { name: BANNER })).not.toBeInTheDocument();
  });

  it("shows when groups exist but every position is gone", () => {
    render(<PositionsEditor groups={renamedGroups} positions={[]} trainingStationIds={[]} />);
    expect(screen.getByRole("button", { name: BANNER })).toBeInTheDocument();
  });
});

describe("PositionsEditor reorder arrows", () => {
  it("disables every arrow in the group while an order is saving, then re-enables them", async () => {
    let finish: (value: { ok: true; data: undefined }) => void = () => {};
    reorderPositions.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<PositionsEditor groups={renamedGroups} positions={twoPositions} trainingStationIds={[]} />);

    const secondUp = screen.getByRole("button", { name: "Move Register 2 up" });
    const firstDown = screen.getByRole("button", { name: "Move Register 1 down" });
    expect(secondUp).toBeEnabled();
    expect(firstDown).toBeEnabled();

    fireEvent.click(firstDown);

    await waitFor(() => expect(screen.getByRole("button", { name: "Move Register 2 up" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Move Register 1 down" })).toBeDisabled();
    expect(reorderPositions).toHaveBeenCalledTimes(1);

    // A second tap while saving must not send a second, overlapping order.
    fireEvent.click(screen.getByRole("button", { name: "Move Register 2 up" }));
    expect(reorderPositions).toHaveBeenCalledTimes(1);

    finish({ ok: true, data: undefined });
    await waitFor(() => expect(screen.getByRole("button", { name: "Move Register 2 up" })).toBeEnabled());
  });
});

describe("PositionsEditor delete prompts", () => {
  it("says exactly what deleting a position removes", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<PositionsEditor groups={renamedGroups} positions={twoPositions} trainingStationIds={[]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    // The group's Delete sits in the card header; the opened row's Delete follows it.
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[1]);

    expect(confirm).toHaveBeenCalledTimes(1);
    const prompt = String(confirm.mock.calls[0][0]);
    expect(prompt).toContain('"Register 1"');
    expect(prompt).toContain("training passport");
    expect(prompt).toContain("rating rubric");
    expect(prompt).toContain("re-rate reminders");
    expect(prompt).toContain("setup assignments, setup template slots, and layout tiles");
    expect(prompt).toContain("cannot be undone");
    expect(prompt).toContain("nothing is deleted");
    expect(deletePosition).not.toHaveBeenCalled();
  });

  it("says exactly what deleting a group removes", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<PositionsEditor groups={renamedGroups} positions={twoPositions} trainingStationIds={[]} />);

    // The group's own Delete button is the only one visible before a row is opened.
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const prompt = String(confirm.mock.calls[0][0]);
    expect(prompt).toContain('"Counter (renamed)"');
    expect(prompt).toContain("2 positions");
    expect(prompt).toContain("training passport");
    expect(prompt).toContain("rating rubric");
    expect(prompt).toContain("cannot be undone");
    expect(deletePositionGroup).not.toHaveBeenCalled();
  });
});
