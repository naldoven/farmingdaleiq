import { describe, expect, it, vi } from "vitest";

const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

import BreaksLayout from "./breaks/layout";
import SetupsLayout from "./setups/layout";

describe("dormant feature routes", () => {
  it("returns not found for the complete Breaks route tree", () => {
    expect(() => BreaksLayout({ children: null })).toThrow("NEXT_NOT_FOUND");
  });

  it("returns not found for the complete Setups route tree", () => {
    expect(() => SetupsLayout({ children: null })).toThrow("NEXT_NOT_FOUND");
  });
});
