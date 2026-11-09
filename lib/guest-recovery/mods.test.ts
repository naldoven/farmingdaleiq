import { describe, expect, it } from "vitest";

import { deriveFaultSource, formatMods, hasMods, parseList } from "@/lib/guest-recovery/mods";

describe("deriveFaultSource", () => {
  it("receipt did not show what the guest ordered: order entry", () => {
    expect(deriveFaultSource(false, false)).toBe("order_entry");
    expect(deriveFaultSource(false, true)).toBe("order_entry");
    expect(deriveFaultSource(false, null)).toBe("order_entry");
  });

  it("receipt was right but the item did not match it: made wrong", () => {
    expect(deriveFaultSource(true, false)).toBe("made_wrong");
  });

  it("receipt right and item matched it, guest still got the wrong thing: bagging", () => {
    expect(deriveFaultSource(true, true)).toBe("bagging");
  });

  it("any unanswered question that matters: not sure", () => {
    expect(deriveFaultSource(null, null)).toBe("not_sure");
    expect(deriveFaultSource(undefined, undefined)).toBe("not_sure");
    expect(deriveFaultSource(true, null)).toBe("not_sure");
    expect(deriveFaultSource(true, undefined)).toBe("not_sure");
    expect(deriveFaultSource(null, true)).toBe("not_sure");
    expect(deriveFaultSource(null, false)).toBe("not_sure");
  });
});

describe("formatMods", () => {
  it("writes removals as 'no X' and additions as given", () => {
    expect(formatMods({ removed: ["Pickles", "Tomato"], added: ["Extra sauce"], note: null })).toBe(
      "no pickles, no tomato, extra sauce",
    );
  });

  it("appends the free-text note and trims it", () => {
    expect(formatMods({ removed: ["Pickles"], added: [], note: "  cut in half " })).toBe("no pickles, cut in half");
  });

  it("is empty when there are no mods", () => {
    expect(formatMods({ removed: [], added: [], note: null })).toBe("");
    expect(formatMods({})).toBe("");
    expect(formatMods({ note: "   " })).toBe("");
  });
});

describe("hasMods", () => {
  it("is true for a removal, an addition or a note", () => {
    expect(hasMods({ removed: ["Pickles"] })).toBe(true);
    expect(hasMods({ added: ["Extra sauce"] })).toBe(true);
    expect(hasMods({ note: "light ice" })).toBe(true);
  });

  it("is false for nothing", () => {
    expect(hasMods({ removed: [], added: [], note: "  " })).toBe(false);
    expect(hasMods({})).toBe(false);
  });
});

describe("parseList", () => {
  it("splits on commas and new lines, trims, drops blanks and repeats", () => {
    expect(parseList("Pickles, Tomato\n Lettuce ,, pickles")).toEqual(["Pickles", "Tomato", "Lettuce"]);
  });

  it("caps the list and each name", () => {
    const many = Array.from({ length: 30 }, (_, i) => `Item ${i}`).join(",");
    expect(parseList(many)).toHaveLength(12);
    expect(parseList("x".repeat(100))[0]).toHaveLength(40);
  });

  it("returns an empty list for blank text", () => {
    expect(parseList("  ,  \n ")).toEqual([]);
  });
});
