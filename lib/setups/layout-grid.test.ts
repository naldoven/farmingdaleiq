import { describe, expect, it } from "vitest";

import { clampTileToBounds, moveTile, snapToGrid } from "./layout-grid";

describe("snapToGrid", () => {
  it("rounds to the nearest integer cell", () => {
    expect(snapToGrid(3.4)).toBe(3);
    expect(snapToGrid(3.6)).toBe(4);
  });
});

describe("clampTileToBounds", () => {
  it("leaves an in-bounds tile untouched", () => {
    expect(clampTileToBounds({ x: 2, y: 2, w: 2, h: 1 })).toEqual({
      x: 2,
      y: 2,
      w: 2,
      h: 1,
    });
  });

  it("clamps a tile dragged past the right/bottom edge", () => {
    expect(clampTileToBounds({ x: 20, y: 20, w: 2, h: 2 })).toEqual({
      x: 10,
      y: 6,
      w: 2,
      h: 2,
    });
  });

  it("clamps a tile dragged past the left/top edge", () => {
    expect(clampTileToBounds({ x: -5, y: -5, w: 1, h: 1 })).toEqual({
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    });
  });

  it("shrinks a tile wider/taller than the grid", () => {
    expect(clampTileToBounds({ x: 0, y: 0, w: 99, h: 99 })).toEqual({
      x: 0,
      y: 0,
      w: 12,
      h: 8,
    });
  });
});

describe("moveTile", () => {
  it("moves a tile by the drag delta", () => {
    const result = moveTile({ x: 2, y: 2, w: 1, h: 1 }, { x: 2, y: 2 }, { x: 5, y: 3 });
    expect(result).toEqual({ x: 5, y: 3, w: 1, h: 1 });
  });

  it("clamps the result to stay on the canvas", () => {
    const result = moveTile({ x: 10, y: 6, w: 2, h: 2 }, { x: 0, y: 0 }, { x: 5, y: 5 });
    expect(result).toEqual({ x: 10, y: 6, w: 2, h: 2 });
  });
});
