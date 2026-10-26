import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rejectClean, refresh } = vi.hoisted(() => ({ rejectClean: vi.fn(), refresh: vi.fn() }));

vi.mock("@/app/(app)/cleaning/today-actions", () => ({ rejectClean }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { RejectCleanButton } from "@/components/cleaning/today-reject-button";

const ID = "a1111111-1111-4111-8111-111111111111";

beforeEach(() => {
  rejectClean.mockReset();
  refresh.mockReset();
});
afterEach(cleanup);

function openSheet() {
  render(<RejectCleanButton id={ID} itemName="Mop sink" />);
  fireEvent.click(screen.getByRole("button", { name: /^Reject/ }));
  return screen.getByRole("dialog");
}

describe("RejectCleanButton", () => {
  it("opens a sheet that names the clean and asks what needs redoing", () => {
    const sheet = openSheet();
    expect(sheet).toHaveTextContent("Send this clean back");
    expect(sheet).toHaveTextContent("Mop sink");
    expect(screen.getByLabelText("What needs redoing?")).toBeInTheDocument();
  });

  it("will not send without a note", () => {
    openSheet();
    const send = screen.getByRole("button", { name: "Reject and redo" });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText("What needs redoing?"), { target: { value: "   " } });
    expect(send).toBeDisabled();
    expect(rejectClean).not.toHaveBeenCalled();
  });

  it("caps the note at 300 characters and shows the count", () => {
    openSheet();
    const note = screen.getByLabelText("What needs redoing?");
    expect(note).toHaveAttribute("maxlength", "300");
    fireEvent.change(note, { target: { value: "Vent still dusty" } });
    expect(screen.getByText("16/300")).toBeInTheDocument();
  });

  it("sends the id and note, then closes and refreshes", async () => {
    rejectClean.mockResolvedValue({ ok: true, data: undefined });
    openSheet();
    fireEvent.change(screen.getByLabelText("What needs redoing?"), { target: { value: "Vent still dusty" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject and redo" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(rejectClean).toHaveBeenCalledWith({ id: ID, note: "Vent still dusty" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the sheet and the note open with the server's message when it fails", async () => {
    rejectClean.mockResolvedValue({ ok: false, error: "You don't have permission to do this." });
    openSheet();
    fireEvent.change(screen.getByLabelText("What needs redoing?"), { target: { value: "Vent still dusty" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject and redo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have permission to do this.");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText("What needs redoing?")).toHaveValue("Vent still dusty");
  });

  it("closes without sending on Cancel", async () => {
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(rejectClean).not.toHaveBeenCalled();
  });
});
