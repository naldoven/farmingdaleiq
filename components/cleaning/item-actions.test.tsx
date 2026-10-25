import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { approveItem, deleteDraftItem, retireItem, refresh, push } = vi.hoisted(() => ({
  approveItem: vi.fn(),
  deleteDraftItem: vi.fn(),
  retireItem: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/app/(app)/cleaning/actions", () => ({ approveItem, deleteDraftItem, retireItem }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

import { ItemActions } from "@/components/cleaning/item-actions";

const ID = "a1111111-1111-4111-8111-111111111111";
const OK = { ok: true, data: undefined };

beforeEach(() => {
  for (const mock of [approveItem, deleteDraftItem, retireItem, refresh, push]) mock.mockReset();
  approveItem.mockResolvedValue(OK);
  deleteDraftItem.mockResolvedValue(OK);
  retireItem.mockResolvedValue(OK);
});
afterEach(cleanup);

describe("ItemActions on a draft", () => {
  it("approves with one tap and refreshes the page", async () => {
    render(<ItemActions id={ID} status="draft" />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(approveItem).toHaveBeenCalledWith({ id: ID });
  });

  it("asks before deleting and does nothing if the planner keeps it", () => {
    render(<ItemActions id={ID} status="draft" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteDraftItem).not.toHaveBeenCalled();
    expect(screen.getByText(/can't be undone/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(deleteDraftItem).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("deletes after the confirm and goes to the list when given a destination", async () => {
    render(<ItemActions id={ID} status="draft" afterDeleteHref="/cleaning/items" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/cleaning/items"));
    expect(deleteDraftItem).toHaveBeenCalledWith({ id: ID });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the server's message and stays put when the action fails", async () => {
    approveItem.mockResolvedValue({ ok: false, error: "You don't have permission to do this." });
    render(<ItemActions id={ID} status="draft" />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have permission to do this.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("holds Approve back, with the reason, while edits are unsaved", () => {
    render(<ItemActions id={ID} status="draft" approveBlockedReason="Save your changes first." />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByText("Save your changes first.")).toBeInTheDocument();
  });
});

describe("ItemActions on other statuses", () => {
  it("offers Retire, behind a confirm, on an active item", async () => {
    render(<ItemActions id={ID} status="active" />);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retire" }));
    expect(retireItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, retire" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(retireItem).toHaveBeenCalledWith({ id: ID });
  });

  it("renders nothing for a retired item", () => {
    const { container } = render(<ItemActions id={ID} status="retired" />);
    expect(container).toBeEmptyDOMElement();
  });
});
