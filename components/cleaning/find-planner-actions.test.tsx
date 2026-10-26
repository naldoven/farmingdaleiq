import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { convertFind, deleteFind, refresh } = vi.hoisted(() => ({
  convertFind: vi.fn(),
  deleteFind: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/(app)/cleaning/finds-actions", () => ({ convertFind, deleteFind }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { FindPlannerActions } from "@/components/cleaning/find-planner-actions";

const FIND = "f1111111-1111-4111-8111-111111111111";
const FRYER = "b2222222-2222-4222-8222-222222222222";
const ZONES = [
  { id: "a1111111-1111-4111-8111-111111111111", name: "Walk-in", color: "#16A34A", side: "boh" },
  { id: FRYER, name: "Fryer line", color: "#E51636", side: "boh" },
];

beforeEach(() => {
  convertFind.mockReset();
  deleteFind.mockReset();
  refresh.mockReset();
  convertFind.mockResolvedValue({ ok: true, data: undefined });
  deleteFind.mockResolvedValue({ ok: true, data: undefined });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(note = "Grease behind the fryer") {
  render(<FindPlannerActions findId={FIND} zoneId={FRYER} note={note} zones={ZONES} />);
}

function openSheet(note?: string) {
  setup(note);
  fireEvent.click(screen.getByRole("button", { name: /^Add to master list/ }));
  return screen.getByRole("dialog");
}

describe("FindPlannerActions", () => {
  it("offers Add to master list and Delete", () => {
    setup();
    expect(screen.getByRole("button", { name: /^Add to master list/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Delete find/ })).toBeInTheDocument();
  });

  it("opens the item form with the find's area and note already filled in", () => {
    const sheet = openSheet();
    expect(sheet).toHaveTextContent("Add to the master list");
    expect(screen.getByLabelText("Name")).toHaveValue("Grease behind the fryer");
    expect(screen.getByRole("button", { name: "Fryer line" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Walk-in" })).toHaveAttribute("aria-pressed", "false");
  });

  it("trims a long note to the item name limit", () => {
    openSheet("x".repeat(200));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toHaveLength(120);
  });

  it("will not add until the planner says how often it comes around", () => {
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Add to master list" }));
    expect(convertFind).not.toHaveBeenCalled();
    expect(screen.getByText("Pick at least one day")).toBeInTheDocument();
  });

  it("adds a constant with the picked days, closes, and refreshes", async () => {
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Mon" }));
    fireEvent.click(screen.getByRole("button", { name: "Thu" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to master list" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(convertFind).toHaveBeenCalledTimes(1);
    expect(convertFind).toHaveBeenCalledWith({
      findId: FIND,
      details: expect.objectContaining({
        zoneId: FRYER,
        name: "Grease behind the fryer",
        kind: "constant",
        daysOfWeek: [1, 4],
        half: "am",
      }),
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("adds a variable with its repeat", async () => {
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Variable" }));
    fireEvent.click(screen.getByRole("button", { name: "4 wks (monthly)" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to master list" }));
    await waitFor(() => expect(convertFind).toHaveBeenCalled());
    expect(convertFind.mock.calls[0]![0].details).toMatchObject({ kind: "variable", intervalWeeks: 4 });
  });

  it("keeps the sheet open and shows the reason when the server refuses", async () => {
    convertFind.mockResolvedValue({ ok: false, error: "You don't have permission to do this." });
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Mon" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to master list" }));
    expect(await screen.findByText("You don't have permission to do this.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("cancels without saving", () => {
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(convertFind).not.toHaveBeenCalled();
  });

  it("deletes after the planner confirms, then refreshes", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    setup();
    fireEvent.click(screen.getByRole("button", { name: /^Delete find/ }));
    await waitFor(() => expect(deleteFind).toHaveBeenCalledWith({ id: FIND }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("does nothing when the planner backs out of the delete", () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    setup();
    fireEvent.click(screen.getByRole("button", { name: /^Delete find/ }));
    expect(deleteFind).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows why a delete failed", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    deleteFind.mockResolvedValue({ ok: false, error: "You don't have permission to do this." });
    setup();
    fireEvent.click(screen.getByRole("button", { name: /^Delete find/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have permission to do this.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
