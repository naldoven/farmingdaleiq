import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PhotoWithMarkup } from "@/components/cleaning/photo-with-markup";

afterEach(cleanup);

const MARKUP = {
  strokes: [
    {
      points: [
        [0.1, 0.2],
        [0.5, 0.5],
        [0.9, 0.8],
      ] as [number, number][],
    },
    {
      points: [
        [0.3, 0.3],
        [0.4, 0.35],
      ] as [number, number][],
    },
  ],
};

describe("PhotoWithMarkup", () => {
  it("draws a white halo under a red line for every stroke", () => {
    const { container } = render(<PhotoWithMarkup src="https://x.test/a.jpg" markup={MARKUP} alt="Fryer vent" />);
    const lines = [...container.querySelectorAll("polyline")];
    expect(lines).toHaveLength(MARKUP.strokes.length * 2);

    const [halo, line] = lines;
    expect(halo).toHaveAttribute("stroke", "#FFFFFF");
    expect(line).toHaveAttribute("stroke", "#DC2626");
    expect(Number(halo.getAttribute("stroke-width"))).toBeGreaterThan(Number(line.getAttribute("stroke-width")));
    for (const polyline of lines) {
      expect(polyline).toHaveAttribute("vector-effect", "non-scaling-stroke");
      expect(polyline).toHaveAttribute("stroke-linecap", "round");
      expect(polyline).toHaveAttribute("stroke-linejoin", "round");
    }
    expect(halo).toHaveAttribute("points", "0.1,0.2 0.5,0.5 0.9,0.8");
  });

  it("stretches the overlay over a natural-aspect image so they line up", () => {
    const { container } = render(<PhotoWithMarkup src="https://x.test/a.jpg" markup={MARKUP} alt="Fryer vent" />);
    const img = screen.getByAltText("Fryer vent");
    expect(img).toHaveClass("block", "w-full", "h-auto");
    expect(container.firstElementChild).toHaveClass("relative");
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 1 1");
    expect(svg).toHaveAttribute("preserveAspectRatio", "none");
    expect(svg).toHaveClass("absolute");
  });

  it("paints a lone tap as a dot instead of nothing", () => {
    const { container } = render(
      <PhotoWithMarkup src="https://x.test/a.jpg" markup={{ strokes: [{ points: [[0.5, 0.5]] }] }} alt="Tap" />,
    );
    expect(container.querySelector("polyline")).toHaveAttribute("points", "0.5,0.5 0.5,0.5");
  });

  it("renders the photo alone when there is no drawing", () => {
    const { container } = render(<PhotoWithMarkup src="https://x.test/a.jpg" markup={null} alt="Plain" />);
    expect(screen.getByAltText("Plain")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("shows a neutral placeholder when there is no photo", () => {
    const { container } = render(<PhotoWithMarkup src={null} markup={MARKUP} alt="Missing" />);
    expect(screen.getByText("No photo yet")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector("polyline")).toBeNull();
  });

  it("lets the caller say the photo is unavailable", () => {
    render(<PhotoWithMarkup src={null} markup={null} alt="Missing" emptyLabel="Photo unavailable" />);
    expect(screen.getByText("Photo unavailable")).toBeInTheDocument();
  });
});
