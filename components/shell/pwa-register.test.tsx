import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/hooks/use-hydrated", () => ({
  useHydrated: () => true,
}));

let mockPathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

import { isGuestPath, PwaRegister } from "./pwa-register";

const iosSafariUserAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

beforeEach(() => {
  mockPathname = "/";
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

describe("guest pages", () => {
  it("knows which paths are guest pages", () => {
    expect(isGuestPath("/recover/abc123")).toBe(true);
    expect(isGuestPath("/recover")).toBe(true);
    expect(isGuestPath("/")).toBe(false);
    expect(isGuestPath("/guest-recovery")).toBe(false);
    expect(isGuestPath("/recovery-plan")).toBe(false);
    expect(isGuestPath(null)).toBe(false);
  });

  it("never shows the install prompt on a guest page, even on iOS Safari", () => {
    mockPathname = `/recover/${"d".repeat(64)}`;
    render(<PwaRegister />);
    expect(screen.queryByText(/Install FarmingdaleIQ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tap Share, then/)).not.toBeInTheDocument();
  });

  it("does not keep the browser's install event on a guest page, but still stops the browser banner", () => {
    mockPathname = `/recover/${"d".repeat(64)}`;
    Object.defineProperty(window.navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (Linux; Android 14) Chrome/130" });
    render(<PwaRegister />);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByText(/Install FarmingdaleIQ/)).not.toBeInTheDocument();
  });
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
