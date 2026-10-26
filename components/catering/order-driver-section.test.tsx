import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The real toggle calls a server action; its own behavior is not under test here.
vi.mock("@/components/catering/drivers/platform-toggle", () => ({
  DeliveryPlatformToggle: ({ platform, canEdit }: { platform: string; canEdit: boolean }) => (
    <span>{`toggle:${platform}:${canEdit ? "edit" : "read"}`}</span>
  ),
}));

import { OrderDriverSection, driversPageHref } from "./order-driver-section";

// Mon Oct 26 2026 is "today"; Tuesday is the next open day.
const TODAY = "2026-10-26";

const props = {
  orderId: "o1",
  eventDate: TODAY,
  today: TODAY,
  platform: "roadway" as const,
  drivers: [],
  open: true,
  canEditPlatform: true,
  canReserve: true,
};

afterEach(() => cleanup());

describe("driversPageHref", () => {
  it("sends today's order to the Today tab", () => {
    expect(driversPageHref("2026-10-26", TODAY)).toBe("/catering/drivers?view=today");
  });

  it("sends the next open day's order to the Tomorrow tab", () => {
    expect(driversPageHref("2026-10-27", TODAY)).toBe("/catering/drivers?view=tomorrow");
  });

  it("treats Monday as tomorrow when today is Saturday", () => {
    expect(driversPageHref("2026-10-26", "2026-10-24")).toBe("/catering/drivers?view=tomorrow");
  });

  it("sends the rest of the next six days to the Week tab", () => {
    expect(driversPageHref("2026-10-30", TODAY)).toBe("/catering/drivers?view=week");
    expect(driversPageHref("2026-11-01", TODAY)).toBe("/catering/drivers?view=week");
  });

  it("has no tab for an order further out or already past", () => {
    expect(driversPageHref("2026-11-02", TODAY)).toBeNull();
    expect(driversPageHref("2026-10-20", TODAY)).toBeNull();
  });
});

describe("OrderDriverSection", () => {
  it("shows the app, Needs driver, and the link to reserve", () => {
    render(<OrderDriverSection {...props} />);

    expect(screen.getByText("toggle:roadway:edit")).toBeInTheDocument();
    expect(screen.getByText("Reserve the driver in Roadway.")).toBeInTheDocument();
    expect(screen.getByText("Needs driver")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reserve on the Drivers page" })).toHaveAttribute(
      "href",
      "/catering/drivers?view=today",
    );
  });

  it("lists reserved drivers by full name", () => {
    render(
      <OrderDriverSection
        {...props}
        platform="ezcater"
        drivers={[
          { profileId: "p1", name: "Messiah Cole" },
          { profileId: "p2", name: "Jordan Ames" },
        ]}
      />,
    );

    expect(screen.getByText("Messiah Cole, Jordan Ames")).toBeInTheDocument();
    expect(screen.getByText("Reserve the driver in ezCater and Roadway.")).toBeInTheDocument();
    expect(screen.getByText("Drivers")).toBeInTheDocument();
    expect(screen.queryByText("Needs driver")).not.toBeInTheDocument();
  });

  it("hides the reserve link from people who cannot reserve", () => {
    render(<OrderDriverSection {...props} canReserve={false} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("does not ask for a driver on a closed order", () => {
    render(<OrderDriverSection {...props} open={false} />);

    expect(screen.queryByText("Needs driver")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("No driver was reserved.")).toBeInTheDocument();
  });

  it("says so when the drivers could not be read, instead of claiming none", () => {
    render(<OrderDriverSection {...props} drivers={null} />);

    expect(screen.getByText(/Could not load the drivers/)).toBeInTheDocument();
    expect(screen.queryByText("Needs driver")).not.toBeInTheDocument();
  });
});
