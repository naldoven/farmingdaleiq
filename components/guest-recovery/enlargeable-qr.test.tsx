import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EnlargeableQr } from "./enlargeable-qr";

afterEach(cleanup);

const SRC = "data:image/svg+xml;base64,PHN2Zy8+";

describe("EnlargeableQr", () => {
  it("shows the code at a normal size with a tap hint, and no enlarged view yet", () => {
    render(<EnlargeableQr src={SRC} />);
    expect(screen.getByRole("button", { name: "Enlarge your code" })).toBeInTheDocument();
    expect(screen.getByText("Tap to enlarge")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a full-screen view of the same code when tapped", () => {
    render(<EnlargeableQr src={SRC} />);
    fireEvent.click(screen.getByRole("button", { name: "Enlarge your code" }));
    const dialog = screen.getByRole("dialog", { name: "Your code, enlarged" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByAltText("Your code, enlarged")).toHaveAttribute("src", SRC);
    expect(screen.getByText(/Turn your screen brightness up/)).toBeInTheDocument();
  });

  it("closes with the Close button, a tap outside the code, or Escape", () => {
    render(<EnlargeableQr src={SRC} />);
    const open = () => fireEvent.click(screen.getByRole("button", { name: "Enlarge your code" }));

    open();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    open();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    open();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
