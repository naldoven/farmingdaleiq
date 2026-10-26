import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveDriver: vi.fn(),
  setEscalationContact: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
}));
vi.mock("@/app/(app)/catering/drivers/actions", () => ({
  saveDriver: mocks.saveDriver,
  setEscalationContact: mocks.setEscalationContact,
}));

import type { RosterDriver } from "@/app/(app)/catering/drivers/queries";

import { EscalationContactForm } from "./escalation-contact-form";
import { AddDriverForm, RosterDriverRow } from "./roster-editor";

const MARIA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const maria: RosterDriver = {
  profileId: MARIA,
  name: "Maria Lopez",
  carSize: "small",
  hasRoadwayApp: true,
  hasEzcaterApp: false,
  active: true,
};

beforeEach(() => {
  mocks.saveDriver.mockReset();
  mocks.setEscalationContact.mockReset();
  mocks.refresh.mockReset();
  mocks.saveDriver.mockResolvedValue({ ok: true, data: undefined });
  mocks.setEscalationContact.mockResolvedValue({ ok: true, data: undefined });
});

afterEach(() => {
  cleanup();
});

describe("RosterDriverRow", () => {
  it("is read-only text without catering.drivers", () => {
    render(
      <ul>
        <RosterDriverRow driver={{ ...maria, hasEzcaterApp: true }} canEdit={false} />
      </ul>,
    );
    expect(screen.getByText("Small car · Roadway, ezCater")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("labels a driver who is off the list", () => {
    render(
      <ul>
        <RosterDriverRow driver={{ ...maria, active: false }} canEdit={false} />
      </ul>,
    );
    expect(screen.getByText("Off the list")).toBeInTheDocument();
  });

  it("keeps Save off until something changes, then saves every field", async () => {
    render(
      <ul>
        <RosterDriverRow driver={maria} canEdit />
      </ul>,
    );
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: "Large car" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "ezCater app" }));
    fireEvent.click(screen.getByRole("switch", { name: "On the driver list" }));
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(mocks.saveDriver).toHaveBeenCalledWith({
        profileId: MARIA,
        carSize: "large",
        hasRoadwayApp: true,
        hasEzcaterApp: true,
        active: false,
      }),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    // The status renders when the save transition commits, which can trail the
    // refresh call by more than findBy's 1s default when the full suite is busy.
    expect(await screen.findByText("Saved", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("shows a failed save and does not refresh", async () => {
    mocks.saveDriver.mockResolvedValue({ ok: false, error: "That team member is not active." });
    render(
      <ul>
        <RosterDriverRow driver={maria} canEdit />
      </ul>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Large car" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That team member is not active.");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("AddDriverForm", () => {
  it("asks for a person before saving", () => {
    render(<AddDriverForm people={[{ id: TOM, name: "Tom Kim" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Add driver" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a team member first.");
    expect(mocks.saveDriver).not.toHaveBeenCalled();
  });

  it("adds the chosen person as an active driver", async () => {
    render(<AddDriverForm people={[{ id: TOM, name: "Tom Kim" }]} />);
    fireEvent.change(screen.getByLabelText("Team member"), { target: { value: TOM } });
    fireEvent.click(screen.getByRole("radio", { name: "Large car" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Roadway app" }));
    fireEvent.click(screen.getByRole("button", { name: "Add driver" }));

    await waitFor(() =>
      expect(mocks.saveDriver).toHaveBeenCalledWith({
        profileId: TOM,
        carSize: "large",
        hasRoadwayApp: true,
        hasEzcaterApp: false,
        active: true,
      }),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it("says so when everyone is already on the roster", () => {
    render(<AddDriverForm people={[]} />);
    expect(screen.getByText("Everyone on the team is already on the list.")).toBeInTheDocument();
  });
});

describe("EscalationContactForm", () => {
  const people = [
    { id: MARIA, name: "Maria Lopez" },
    { id: TOM, name: "Tom Kim" },
  ];

  it("saves a new contact and can clear it back to Nobody", async () => {
    render(<EscalationContactForm current={null} people={people} />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Escalation contact"), { target: { value: TOM } });
    fireEvent.click(save);
    await waitFor(() => expect(mocks.setEscalationContact).toHaveBeenCalledWith({ profileId: TOM }));
  });

  it("sends null for Nobody", async () => {
    render(<EscalationContactForm current={people[0]} people={people} />);
    fireEvent.change(screen.getByLabelText("Escalation contact"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.setEscalationContact).toHaveBeenCalledWith({ profileId: null }));
  });

  it("keeps a contact who went inactive as a selectable option", () => {
    render(<EscalationContactForm current={{ id: "gone", name: "Pat Gone" }} people={people} />);
    expect(screen.getByRole("option", { name: "Pat Gone" })).toBeInTheDocument();
    expect(screen.getByLabelText("Escalation contact")).toHaveValue("gone");
  });
});
