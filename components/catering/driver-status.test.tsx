import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DriverStatusBadge, driverStatusLabel } from "./driver-status";

const messiah = { profileId: "p1", name: "Messiah Cole" };
const jordan = { profileId: "p2", name: "Jordan Ames" };

afterEach(() => cleanup());

describe("driverStatusLabel", () => {
  it("asks for a driver when nobody is reserved", () => {
    expect(driverStatusLabel([])).toBe("Needs driver");
  });

  it("names one driver by first name", () => {
    expect(driverStatusLabel([messiah])).toBe("Driver: Messiah");
  });

  it("lists several drivers with a plural label", () => {
    expect(driverStatusLabel([messiah, jordan])).toBe("Drivers: Messiah, Jordan");
  });

  it("falls back to full names when two drivers share a first name", () => {
    const alexR = { profileId: "p3", name: "Alex Rivera" };
    const alexT = { profileId: "p4", name: "Alex Tran" };
    expect(driverStatusLabel([alexR, alexT])).toBe("Drivers: Alex Rivera, Alex Tran");
  });

  it("copes with a one-word name", () => {
    expect(driverStatusLabel([{ profileId: "p5", name: "Messiah" }])).toBe("Driver: Messiah");
  });
});

describe("DriverStatusBadge", () => {
  it("uses the danger tint when no driver is reserved", () => {
    render(<DriverStatusBadge drivers={[]} />);
    expect(screen.getByText("Needs driver")).toHaveClass("bg-danger-soft", "text-danger");
  });

  it("uses the success tint once someone is reserved", () => {
    render(<DriverStatusBadge drivers={[messiah]} />);
    expect(screen.getByText("Driver: Messiah")).toHaveClass("bg-success-soft", "text-success");
  });
});
