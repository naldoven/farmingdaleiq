import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setOrderDrivers: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
}));
vi.mock("@/app/(app)/catering/drivers/actions", () => ({
  setOrderDrivers: mocks.setOrderDrivers,
  setDeliveryPlatform: vi.fn(),
}));

import type { BoardOrder } from "@/app/(app)/catering/drivers/logic";
import type { RosterDriver } from "@/app/(app)/catering/drivers/queries";

import { DriverPickerProvider, ReserveDriverButton } from "./driver-picker";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const MARIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DEE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OLD = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function driver(profileId: string, name: string, over: Partial<RosterDriver> = {}): RosterDriver {
  return {
    profileId,
    name,
    carSize: "small",
    hasRoadwayApp: true,
    hasEzcaterApp: false,
    active: true,
    ...over,
  };
}

const ROSTER: RosterDriver[] = [
  driver(MARIA, "Maria Lopez"),
  driver(TOM, "Tom Kim", { carSize: "large", hasEzcaterApp: true }),
  driver(DEE, "Dee Park"),
];

function order(over: Partial<BoardOrder> = {}): BoardOrder {
  return {
    id: ORDER_ID,
    guestName: "Ridgeview School",
    eventDate: "2026-10-13",
    eventTime: "12:15:00",
    headcount: 45,
    platform: "roadway",
    drivers: [],
    ...over,
  };
}

function mount(opts: { order?: BoardOrder; roster?: RosterDriver[]; onSetup?: string[] } = {}) {
  const o = opts.order ?? order();
  return render(
    <DriverPickerProvider
      orders={[o]}
      roster={opts.roster ?? ROSTER}
      onSetupByDate={{ [o.eventDate]: opts.onSetup ?? [TOM] }}
      canSetPlatform={false}
    >
      <ReserveDriverButton orderId={o.id} guestName={o.guestName} hasDrivers={o.drivers.length > 0} />
    </DriverPickerProvider>,
  );
}

function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: /for Ridgeview School/ }));
  return screen.getByRole("dialog");
}

beforeEach(() => {
  mocks.setOrderDrivers.mockReset();
  mocks.refresh.mockReset();
  mocks.setOrderDrivers.mockResolvedValue({ ok: true, data: { added: 1, removed: 0 } });
});

afterEach(() => {
  cleanup();
});

describe("driver picker", () => {
  it("shows the order, groups setup drivers first, and starts with nothing to save", () => {
    mount();
    const dialog = openPicker();

    expect(within(dialog).getByRole("heading", { level: 2 })).toHaveTextContent("Ridgeview School · 12:15 PM");
    expect(within(dialog).getByText("Tuesday, Oct 13 · 45 guests")).toBeInTheDocument();

    const headings = within(dialog)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual(["Driver app", "On that day's Setup", "Other drivers"]);

    const boxes = within(dialog)
      .getAllByRole("checkbox")
      .map((box) => box.closest("label")?.textContent);
    expect(boxes[0]).toContain("Tom Kim");
    expect(boxes[1]).toContain("Dee Park");
    expect(boxes[2]).toContain("Maria Lopez");

    expect(within(dialog).getByRole("button", { name: "Pick a driver" })).toBeDisabled();
    expect(within(dialog).getByText("Reserve in Roadway first, then tap here.")).toBeInTheDocument();
  });

  it("sits above the mobile tab bar", () => {
    mount();
    const dialog = openPicker();
    // The bottom tab bar is z-40; a sheet below it leaves its own buttons untappable.
    expect(dialog.parentElement?.className).toContain("z-[60]");
    expect(dialog.parentElement?.parentElement).toBe(document.body);
  });

  it("counts drivers in the button and saves the picked set", async () => {
    mount();
    const dialog = openPicker();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Tom Kim/ }));
    expect(within(dialog).getByRole("button", { name: "Mark reserved (1 driver)" })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Maria Lopez/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark reserved (2 drivers)" }));

    await waitFor(() => expect(mocks.setOrderDrivers).toHaveBeenCalledTimes(1));
    expect(mocks.setOrderDrivers).toHaveBeenCalledWith({ orderId: ORDER_ID, profileIds: [TOM, MARIA] });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("warns about a large order until a large car is picked", () => {
    mount();
    const dialog = openPicker();

    expect(within(dialog).queryByText(/Large order/)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Dee Park/ }));
    expect(within(dialog).getByText("Large order (45 guests). Pick at least one large car.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Tom Kim/ }));
    expect(within(dialog).queryByText(/Large order/)).not.toBeInTheDocument();
  });

  it("preselects current drivers and turns into Clear drivers when all are unchecked", async () => {
    mount({ order: order({ drivers: [{ profileId: MARIA, name: "Maria Lopez" }] }) });
    const dialog = openPicker();

    const maria = within(dialog).getByRole("checkbox", { name: /Maria Lopez/ });
    expect(maria).toBeChecked();
    fireEvent.click(maria);
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear drivers" }));

    await waitFor(() =>
      expect(mocks.setOrderDrivers).toHaveBeenCalledWith({ orderId: ORDER_ID, profileIds: [] }),
    );
  });

  it("keeps a reserved driver who came off the list visible and checked", () => {
    mount({
      order: order({ drivers: [{ profileId: OLD, name: "Pat Gone" }] }),
      roster: [...ROSTER, driver(OLD, "Pat Gone", { active: false, carSize: "large" })],
    });
    const dialog = openPicker();

    const pat = within(dialog).getByRole("checkbox", { name: /Pat Gone/ });
    expect(pat).toBeChecked();
    expect(within(dialog).getByText("Reserved, no longer on the list")).toBeInTheDocument();
    // A large car is still picked, so the large-order warning stays quiet.
    expect(within(dialog).queryByText(/Large order/)).not.toBeInTheDocument();
  });

  it("stops at four drivers", () => {
    const roster = ["a", "b", "c", "d", "e"].map((letter, i) =>
      driver(`${i}${i}${i}${i}${i}${i}${i}${i}-0000-4000-8000-000000000000`, `Driver ${letter}`),
    );
    mount({ roster, onSetup: [] });
    const dialog = openPicker();

    for (const box of within(dialog).getAllByRole("checkbox").slice(0, 4)) fireEvent.click(box);
    const rest = within(dialog)
      .getAllByRole("checkbox")
      .filter((box) => !(box as HTMLInputElement).checked);
    expect(rest).toHaveLength(1);
    expect(rest[0]).toBeDisabled();
    expect(within(dialog).getByText("Up to 4 drivers per order.")).toBeInTheDocument();
  });

  it("shows the server's error and stays open", async () => {
    mocks.setOrderDrivers.mockResolvedValue({ ok: false, error: "This order is closed or cancelled." });
    mount();
    const dialog = openPicker();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Tom Kim/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark reserved (1 driver)" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("This order is closed or cancelled.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("names ezCater and Roadway in the hint for an ezCater order, which is reserved in both", () => {
    mount({ order: order({ platform: "ezcater" }) });
    const dialog = openPicker();
    expect(within(dialog).getByText("Reserve in ezCater and Roadway first, then tap here.")).toBeInTheDocument();
  });

  it("closes on Escape and on a backdrop tap, and hands focus back to the row button", () => {
    mount();
    const trigger = screen.getByRole("button", { name: /for Ridgeview School/ });
    trigger.focus();

    openPicker();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    const dialog = openPicker();
    const backdrop = dialog.previousElementSibling as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("points an empty roster at the Roster tab", () => {
    mount({ roster: [] });
    const dialog = openPicker();
    expect(within(dialog).getByText(/No drivers on the list yet\./)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Roster" })).toHaveAttribute(
      "href",
      "/catering/drivers?view=roster",
    );
  });
});
