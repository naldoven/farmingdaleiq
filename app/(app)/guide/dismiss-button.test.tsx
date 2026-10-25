import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

import { resetGuidePrefsCacheForTests } from "@/lib/guide/guide-prefs";

import { DismissGuideButton } from "./dismiss-button";

beforeEach(() => {
  push.mockClear();
  window.localStorage.clear();
  resetGuidePrefsCacheForTests();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetGuidePrefsCacheForTests();
});

describe("DismissGuideButton", () => {
  it("marks the guide dismissed and goes Home", () => {
    render(<DismissGuideButton />);

    fireEvent.click(screen.getByRole("button", { name: "Hide this from Home" }));

    expect(window.localStorage.getItem("fiq.guide.dismissed.v1")).toBe("1");
    expect(push).toHaveBeenCalledWith("/");
  });
});
