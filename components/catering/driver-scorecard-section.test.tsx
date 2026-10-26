import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ScorecardView } from "@/app/(app)/catering/drivers/queries";

import { DriverScorecardSection } from "./driver-scorecard-section";

const empty: ScorecardView = {
  deliveries: 0,
  escalated: 0,
  onTime: 0,
  onTimePct: null,
  byPass: {
    night: { total: 0, escalated: 0, onTime: 0 },
    morning: { total: 0, escalated: 0, onTime: 0 },
    sameDay: { total: 0, escalated: 0, onTime: 0 },
  },
  byLeader: [],
  escalations: [],
  names: {},
};

const busy: ScorecardView = {
  deliveries: 18,
  escalated: 2,
  onTime: 16,
  onTimePct: 89,
  byPass: {
    night: { total: 18, escalated: 2, onTime: 16 },
    morning: { total: 0, escalated: 0, onTime: 0 },
    sameDay: { total: 0, escalated: 0, onTime: 0 },
  },
  byLeader: [{ leaderId: "l1", escalations: 2 }],
  escalations: [
    {
      orderId: "o1",
      guestName: "Maple Elementary",
      eventDate: "2026-10-13",
      eventTime: "11:30:00",
      pass: "night",
      escalatedAt: "2026-10-13T10:00:00.000Z",
      ownerIds: ["l1"],
    },
  ],
  names: { l1: "Dana Cruz" },
};

const links = { title: "Week of Oct 12 to Oct 17", prevHref: "/prev", nextHref: "/next" };

afterEach(() => cleanup());

describe("DriverScorecardSection", () => {
  it("shows the week, the three tiles, and the review copy", () => {
    render(<DriverScorecardSection {...links} card={busy} />);

    expect(screen.getByRole("heading", { name: "Driver reservations" })).toBeInTheDocument();
    expect(screen.getByText("Week of Oct 12 to Oct 17")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("89%")).toBeInTheDocument();
    expect(screen.getByText("Escalations")).toBeInTheDocument();
    expect(
      screen.getByText(
        "On time means marked reserved with no escalation. This is for review with leaders. Nothing is penalized automatically.",
      ),
    ).toBeInTheDocument();
  });

  it("shows each pass as 'x of y on time'", () => {
    // No escalated-order list here, so "Night pass" only appears once.
    render(<DriverScorecardSection {...links} card={{ ...busy, escalations: [] }} />);

    expect(screen.getByText("Night pass")).toBeInTheDocument();
    expect(screen.getByText("16 of 18 on time")).toBeInTheDocument();
    expect(screen.getByText("Morning pass")).toBeInTheDocument();
    expect(screen.getByText("Same day")).toBeInTheDocument();
  });

  it("names the leader and lists the escalated order with its day, time, and pass", () => {
    render(<DriverScorecardSection {...links} card={busy} />);

    expect(screen.getByText("Dana Cruz")).toBeInTheDocument();
    const row = screen.getByRole("link", { name: /Maple Elementary/ });
    expect(row).toHaveAttribute("href", "/catering/orders/o1");
    expect(row).toHaveTextContent("Tuesday, Oct 13 · 11:30 AM");
    expect(row).toHaveTextContent("Night pass");
  });

  it("says 'No deliveries' instead of a percent in an empty week", () => {
    render(<DriverScorecardSection {...links} card={empty} />);

    expect(screen.getAllByText("No deliveries").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.getAllByText("None this week.")).toHaveLength(2);
  });

  it("offers Previous week always and Next week only when there is one", () => {
    const { rerender } = render(<DriverScorecardSection {...links} card={empty} />);
    expect(screen.getByRole("link", { name: "Previous week" })).toHaveAttribute("href", "/prev");
    expect(screen.getByRole("link", { name: "Next week" })).toHaveAttribute("href", "/next");

    rerender(<DriverScorecardSection {...links} nextHref={null} card={empty} />);
    expect(screen.queryByRole("link", { name: "Next week" })).not.toBeInTheDocument();
  });

  it("says so in place when the scorecard could not load", () => {
    render(<DriverScorecardSection {...links} card={null} />);

    expect(screen.getByText(/Could not load the driver scorecard/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous week" })).toBeInTheDocument();
  });
});
