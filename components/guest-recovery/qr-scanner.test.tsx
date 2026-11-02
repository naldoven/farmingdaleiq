import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("jsqr", () => ({ default: vi.fn(() => null) }));

import { QrScanner } from "@/components/guest-recovery/qr-scanner";

const TOKEN = "0123456789abcdef".repeat(4);

beforeEach(() => {
  push.mockClear();
});

afterEach(cleanup);

describe("QrScanner manual entry", () => {
  it("opens the recovery from a pasted link, using only the token from it", () => {
    render(<QrScanner />);
    fireEvent.change(screen.getByLabelText(/paste the guest/i), {
      target: { value: `https://evil.example/recover/${TOKEN}?next=//x` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(push).toHaveBeenCalledWith(`/recover/${TOKEN}`);
  });

  it("opens from the bare code", () => {
    render(<QrScanner />);
    fireEvent.change(screen.getByLabelText(/paste the guest/i), { target: { value: TOKEN } });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(push).toHaveBeenCalledWith(`/recover/${TOKEN}`);
  });

  it("refuses anything that is not a recovery code and goes nowhere", () => {
    render(<QrScanner />);
    fireEvent.change(screen.getByLabelText(/paste the guest/i), { target: { value: "https://evil.example/login" } });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/not a guest recovery code/i);
  });
});

describe("QrScanner camera", () => {
  it("says so plainly when the browser has no camera access, and manual entry stays available", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    render(<QrScanner />);
    fireEvent.click(screen.getByRole("button", { name: /scan with camera/i }));
    expect((await screen.findAllByRole("alert"))[0].textContent).toMatch(/cannot open the camera/i);
    expect(screen.getByLabelText(/paste the guest/i)).toBeTruthy();
  });
});
