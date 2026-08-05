import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hooks/use-hydrated", () => ({
  useHydrated: () => true,
}));

import { PwaRegister } from "./pwa-register";

const iosSafariUserAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

beforeEach(() => {
  window.localStorage.clear();
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: iosSafariUserAgent,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: { register: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("PwaRegister mobile placement", () => {
  it("keeps the install prompt above the fixed mobile tab bar", () => {
    render(<PwaRegister />);

    const instructions = screen.getByText(/Tap Share, then/);
    const overlay = instructions.closest(".fixed");
    const card = instructions.closest(".rounded-xl");

    expect(overlay).toHaveClass(
      "bottom-[calc(4rem_+_max(env(safe-area-inset-bottom,0px),10px))]",
      "md:bottom-0",
      "pointer-events-none",
    );
    expect(card).toHaveClass("pointer-events-auto");
  });
});
