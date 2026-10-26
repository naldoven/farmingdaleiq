import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { BoardOrder } from "@/app/(app)/catering/drivers/logic";

import { MyDeliveriesCard, signInHint } from "./my-deliveries-card";

const order = (overrides: Partial<BoardOrder>): BoardOrder => ({
  id: "o1",
  guestName: "Maple Elementary",
  eventDate: "2026-10-26",
  eventTime: "11:30:00",
  headcount: 30,
  platform: "roadway",
  drivers: [{ profileId: "me", name: "Messiah Cole" }],
  ...overrides,
});

afterEach(() => cleanup());

describe("signInHint", () => {
  it("names Roadway when only Roadway orders are on today", () => {
    expect(signInHint(["roadway", "roadway"])).toBe("Sign in to the Roadway app before you leave.");
  });

  it("names ezCater when only ezCater orders are on today", () => {
    expect(signInHint(["ezcater"])).toBe("Sign in to the ezCater app before you leave.");
  });

  it("names both apps, Roadway first, when the orders mix", () => {
    expect(signInHint(["ezcater", "roadway"])).toBe("Sign in to the Roadway and ezCater apps before you leave.");
  });
});

describe("MyDeliveriesCard", () => {
  it("renders nothing when there are no deliveries", () => {
    const { container } = render(<MyDeliveriesCard orders={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists time, guest, app, and headcount for each delivery", () => {
    render(
      <MyDeliveriesCard
        orders={[
          order({}),
          order({ id: "o2", guestName: "Grace Church", eventTime: "14:00:00", headcount: 1, platform: "ezcater" }),
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Your deliveries today" })).toBeInTheDocument();
    expect(screen.getByText("11:30 AM")).toBeInTheDocument();
    expect(screen.getByText("Maple Elementary")).toBeInTheDocument();
    expect(screen.getByText("Roadway · 30 guests")).toBeInTheDocument();
    expect(screen.getByText("2:00 PM")).toBeInTheDocument();
    expect(screen.getByText("ezCater · 1 guest")).toBeInTheDocument();
    expect(screen.getByText("Sign in to the Roadway and ezCater apps before you leave.")).toBeInTheDocument();
  });

  it("links each row to its order and copes with a missing time or headcount", () => {
    render(<MyDeliveriesCard orders={[order({ eventTime: null, headcount: null })]} />);

    expect(screen.getByText("Time TBD")).toBeInTheDocument();
    expect(screen.getByText("Roadway")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/catering/orders/o1");
  });
});
