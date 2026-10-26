import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { saveSlotCaps, setZoneActive, addCoordinator, removeCoordinator, refresh } = vi.hoisted(() => ({
  saveSlotCaps: vi.fn(),
  setZoneActive: vi.fn(),
  addCoordinator: vi.fn(),
  removeCoordinator: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/(app)/cleaning/settings-actions", () => ({
  saveSlotCaps,
  setZoneActive,
  addCoordinator,
  removeCoordinator,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { buildCapsGrid } from "@/app/(app)/cleaning/settings-view";
import { SettingsCapsGrid } from "@/components/cleaning/settings-caps-grid";
import { SettingsCoordinators } from "@/components/cleaning/settings-coordinators";
import { SettingsZones, type SettingsZone } from "@/components/cleaning/settings-zones";

const OK = { ok: true, data: undefined };

beforeEach(() => {
  for (const mock of [saveSlotCaps, setZoneActive, addCoordinator, removeCoordinator, refresh]) mock.mockReset();
  for (const mock of [saveSlotCaps, setZoneActive, addCoordinator, removeCoordinator]) mock.mockResolvedValue(OK);
});
afterEach(cleanup);

function capsMap(value = 2): Map<string, number> {
  const caps = new Map<string, number>();
  for (let weekday = 1; weekday <= 6; weekday += 1) {
    caps.set(`${weekday}|am`, value);
    caps.set(`${weekday}|pm`, value);
  }
  return caps;
}

describe("SettingsCapsGrid", () => {
  it("explains what a cap is and starts with Save off until something changes", () => {
    render(<SettingsCapsGrid initial={buildCapsGrid(capsMap())} />);
    expect(screen.getByText(/Most variable cleans the Thursday build puts in each half-day/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save caps" })).toBeDisabled();
    // Six days, AM and PM each.
    expect(screen.getAllByRole("group")).toHaveLength(12);
  });

  it("steps a slot, saves all twelve and refreshes", async () => {
    render(<SettingsCapsGrid initial={buildCapsGrid(capsMap())} />);

    fireEvent.click(screen.getByRole("button", { name: "More for PM on Thursday" }));
    fireEvent.click(screen.getByRole("button", { name: "Fewer for AM on Monday" }));
    fireEvent.click(screen.getByRole("button", { name: "Fewer for AM on Monday" }));
    expect(within(screen.getByRole("group", { name: "PM on Thursday" })).getByText("3")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "AM on Monday" })).getByText("0")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save caps" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());

    const { caps } = saveSlotCaps.mock.calls[0]![0] as { caps: { weekday: number; half: string; maxVariables: number }[] };
    expect(caps).toHaveLength(12);
    expect(caps).toContainEqual({ weekday: 4, half: "pm", maxVariables: 3 });
    expect(caps).toContainEqual({ weekday: 1, half: "am", maxVariables: 0 });
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    // The button reads "Saving..." until the transition settles.
    await waitFor(() => expect(screen.getByRole("button", { name: "Save caps" })).toBeDisabled());
  });

  it("stops at 0 and at 20", () => {
    const caps = capsMap();
    caps.set("1|am", 0);
    caps.set("1|pm", 20);
    render(<SettingsCapsGrid initial={buildCapsGrid(caps)} />);
    expect(screen.getByRole("button", { name: "Fewer for AM on Monday" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "More for PM on Monday" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "More for AM on Monday" })).toBeEnabled();
  });

  it("shows the server's message and keeps the edit when the save fails", async () => {
    saveSlotCaps.mockResolvedValue({ ok: false, error: "You don't have permission to do this." });
    render(<SettingsCapsGrid initial={buildCapsGrid(capsMap())} />);
    fireEvent.click(screen.getByRole("button", { name: "More for AM on Friday" }));
    fireEvent.click(screen.getByRole("button", { name: "Save caps" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have permission to do this.");
    expect(refresh).not.toHaveBeenCalled();
    expect(within(screen.getByRole("group", { name: "AM on Friday" })).getByText("3")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Save caps" })).toBeEnabled());
  });
});

const ZONES: SettingsZone[] = [
  { id: "z-green", name: "Green", color: "#16a34a", areas: "Boards, prep", side: "boh", sort: 4, active: true },
  { id: "z-red", name: "Red", color: "#dc2626", areas: "FC, vestibule", side: "foh", sort: 1, active: false },
  { id: "z-blue", name: "Blue", color: "#2563eb", areas: "Dish to door, dumpster", side: "boh", sort: 6, active: true },
];

describe("SettingsZones", () => {
  it("lists zones by side with name, areas and an on or off switch each", () => {
    render(<SettingsZones zones={ZONES} />);
    const boh = screen.getByRole("region", { name: "Back of house" });
    const foh = screen.getByRole("region", { name: "Front of house" });
    expect(within(boh).getByText("Boards, prep")).toBeInTheDocument();
    expect(within(boh).getByRole("switch", { name: "Green zone on the weekly board" })).toBeChecked();
    expect(within(foh).getByRole("switch", { name: "Red zone on the weekly board" })).not.toBeChecked();
    expect(screen.getByText(/adds its items to the next weekly build/)).toBeInTheDocument();
  });

  it("turns a zone on with the opposite of its saved state", async () => {
    render(<SettingsZones zones={ZONES} />);
    fireEvent.click(screen.getByRole("switch", { name: "Red zone on the weekly board" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(setZoneActive).toHaveBeenCalledWith({ id: "z-red", active: true });
  });

  it("shows the error and does not refresh when the switch fails", async () => {
    setZoneActive.mockResolvedValue({ ok: false, error: "That zone was not found." });
    render(<SettingsZones zones={ZONES} />);
    fireEvent.click(screen.getByRole("switch", { name: "Green zone on the weekly board" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That zone was not found.");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: "Green zone on the weekly board" })).toBeChecked();
  });
});

const COORDINATORS = [
  { userId: "u-mariana", name: "Mariana", roleName: "Team Leader", active: true },
  { userId: "u-dana", name: "Dana", roleName: "BOH Trainer", active: false },
];
const OPTIONS = [
  { id: "u-eric", name: "Eric", roleName: "BOH Trainer" },
  { id: "u-nathan", name: "Nathan", roleName: "Team Leader" },
];

describe("SettingsCoordinators for a role-level planner", () => {
  it("lists the tagged people and flags an inactive one", () => {
    render(<SettingsCoordinators coordinators={COORDINATORS} options={OPTIONS} canManage />);
    expect(screen.getByText("Mariana")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("adds the picked person and clears the picker", async () => {
    render(<SettingsCoordinators coordinators={COORDINATORS} options={OPTIONS} canManage />);
    const add = screen.getByRole("button", { name: "Add" });
    expect(add).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Add a coordinator"), { target: { value: "u-eric" } });
    fireEvent.click(add);

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(addCoordinator).toHaveBeenCalledWith({ userId: "u-eric" });
    expect(screen.getByLabelText("Add a coordinator")).toHaveValue("");
  });

  it("asks before removing, and removes only after the yes", async () => {
    render(<SettingsCoordinators coordinators={COORDINATORS} options={OPTIONS} canManage />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Mariana" }));
    expect(removeCoordinator).not.toHaveBeenCalled();
    expect(screen.getByText(/Remove Mariana as a coordinator/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(removeCoordinator).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove Mariana" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(removeCoordinator).toHaveBeenCalledWith({ userId: "u-mariana" });
  });

  it("shows the server's message when the add is refused", async () => {
    addCoordinator.mockResolvedValue({ ok: false, error: "You don't have permission to do this." });
    render(<SettingsCoordinators coordinators={COORDINATORS} options={OPTIONS} canManage />);
    fireEvent.change(screen.getByLabelText("Add a coordinator"), { target: { value: "u-eric" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have permission to do this.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says so when nobody is left to add", () => {
    render(<SettingsCoordinators coordinators={COORDINATORS} options={[]} canManage />);
    expect(screen.getByText(/already a coordinator/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Add a coordinator")).not.toBeInTheDocument();
  });

  it("handles an empty list", () => {
    render(<SettingsCoordinators coordinators={[]} options={OPTIONS} canManage />);
    expect(screen.getByText("No coordinators yet.")).toBeInTheDocument();
  });
});

describe("SettingsCoordinators for a tag-only coordinator", () => {
  it("is read only: no picker, no remove buttons, and it says who can change it", () => {
    render(<SettingsCoordinators coordinators={COORDINATORS} options={[]} canManage={false} />);
    expect(screen.getByText("Mariana")).toBeInTheDocument();
    expect(screen.queryByLabelText("Add a coordinator")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Only a Location Manager or Director/)).toBeInTheDocument();
  });
});
