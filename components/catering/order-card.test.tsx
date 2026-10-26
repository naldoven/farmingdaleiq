import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The stage dropdown pulls in server actions; these tests only look at badges.
vi.mock("@/components/catering/stage-select", () => ({ StageSelect: () => null }));

import { OrderCard, type OrderCardData } from "./order-card";

const base: OrderCardData = {
  id: "o1",
  guestName: "Maple Elementary",
  eventDate: "2026-10-27",
  eventTime: "11:30:00",
  headcount: 30,
  amount: 420,
  fulfillment: "delivery",
  stage: "confirm",
};

afterEach(() => cleanup());

describe("OrderCard driver badge", () => {
  it("shows Needs driver on a delivery with nobody reserved", () => {
    render(<OrderCard order={{ ...base, drivers: [] }} canManage={false} />);
    expect(screen.getByText("Needs driver")).toBeInTheDocument();
  });

  it("names the reserved drivers", () => {
    render(
      <OrderCard
        order={{
          ...base,
          drivers: [
            { profileId: "p1", name: "Messiah Cole" },
            { profileId: "p2", name: "Jordan Ames" },
          ],
        }}
        canManage={false}
      />,
    );
    expect(screen.getByText("Drivers: Messiah, Jordan")).toBeInTheDocument();
  });

  it("shows nothing new on a pickup order", () => {
    render(<OrderCard order={{ ...base, fulfillment: "pickup" }} canManage={false} />);
    expect(screen.queryByText(/driver/i)).not.toBeInTheDocument();
  });

  it("stops asking for a driver once the order has left Pickup/Delivery", () => {
    render(<OrderCard order={{ ...base, stage: "followup", drivers: [] }} canManage={false} />);
    expect(screen.queryByText("Needs driver")).not.toBeInTheDocument();
  });
});
