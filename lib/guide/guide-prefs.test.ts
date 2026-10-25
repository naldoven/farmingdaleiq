import { describe, expect, it } from "vitest";

import { parseDismissed } from "./guide-prefs";

describe("parseDismissed", () => {
  it("is true only for the value the store writes", () => {
    expect(parseDismissed("1")).toBe(true);
  });

  it("is false when nothing is stored", () => {
    expect(parseDismissed(null)).toBe(false);
    expect(parseDismissed("")).toBe(false);
  });

  it("is false for stray or hand-edited values, so the card errs toward showing", () => {
    expect(parseDismissed("0")).toBe(false);
    expect(parseDismissed("true")).toBe(false);
    expect(parseDismissed("{\"dismissed\":true}")).toBe(false);
  });
});
