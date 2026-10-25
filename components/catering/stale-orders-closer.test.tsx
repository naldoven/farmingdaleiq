import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// The real actions file pulls in the server runtime. This screen only calls
// bulkCloseStaleOrders on submit, which these tests never reach.
vi.mock("@/app/(app)/catering/actions", () => ({ bulkCloseStaleOrders: vi.fn() }));

import { StaleOrdersCloser, type StaleOrderRow } from "./stale-orders-closer";

const rows: StaleOrderRow[] = Array.from({ length: 3 }, (_, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  guestName: `Guest ${i}`,
  eventDate: "2026-09-01",
  eventTime: "11:30:00",
  headcount: 20,
  stage: "new",
}));

afterEach(() => cleanup());

describe("StaleOrdersCloser", () => {
  it("says it is showing the oldest slice when more orders are open than were loaded", () => {
    render(<StaleOrdersCloser orders={rows} totalCount={372} canClose />);

    expect(screen.getByText(/Showing the oldest 3 of 372 past-event orders/)).toBeInTheDocument();
    expect(screen.getByText("Past-event orders still open (372)")).toBeInTheDocument();
  });

  it("shows no note when every open order is on screen", () => {
    render(<StaleOrdersCloser orders={rows} totalCount={3} canClose />);

    expect(screen.queryByText(/Showing the oldest/)).not.toBeInTheDocument();
    expect(screen.getByText("Past-event orders still open (3)")).toBeInTheDocument();
  });

  it("Select all picks only the orders on screen, not the whole backlog", () => {
    render(<StaleOrdersCloser orders={rows} totalCount={372} canClose />);

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));

    expect(screen.getByText("3 of 3 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close 3 orders" })).toBeInTheDocument();
  });
});
