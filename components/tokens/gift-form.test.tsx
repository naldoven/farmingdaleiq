import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// jsdom lacks these APIs that Radix Select touches; stub them so it renders.
beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/(app)/tokens/actions", () => ({ sendGift: vi.fn() }));

import { GiftForm } from "./gift-form";

const recipients = [
  { id: "a1", name: "Aaron Adams" },
  { id: "b2", name: "Bea Brooks" },
];

afterEach(() => cleanup());

describe("GiftForm person picker default (S3)", () => {
  it("defaults to no recipient and cannot submit until one is picked", () => {
    render(<GiftForm recipients={recipients} balance={100} />);

    // The trigger shows the placeholder, not a pre-selected coworker.
    expect(screen.getByText("Pick a coworker")).toBeInTheDocument();

    // The submit button is disabled purely by `!toUserId`, so a disabled
    // button here proves the recipient state defaults to empty and the form
    // cannot be submitted until a coworker is explicitly chosen.
    expect(screen.getByRole("button", { name: /send tokens/i })).toBeDisabled();
  });
});
