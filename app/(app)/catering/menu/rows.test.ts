import { describe, expect, it } from "vitest";

import {
  componentsTextToRows,
  findComponentProblem,
  findScalingRuleProblem,
  rowsToComponentsText,
  rowsToScalingRulesText,
  scalingRulesTextToRows,
} from "./rows";

describe("componentsTextToRows", () => {
  it("reads both the string and object shapes the parser accepts", () => {
    expect(componentsTextToRows('["Sandwich", {"name": "Chips", "qty": 2}]')).toEqual([
      { name: "Sandwich", qtyText: "1" },
      { name: "Chips", qtyText: "2" },
    ]);
  });

  it("returns no rows for empty or broken text", () => {
    expect(componentsTextToRows("")).toEqual([]);
    expect(componentsTextToRows("{nope")).toEqual([]);
  });
});

describe("rowsToComponentsText", () => {
  it("drops blank-name rows and trims names", () => {
    const text = rowsToComponentsText([
      { name: " Sandwich ", qtyText: "1" },
      { name: "", qtyText: "5" },
      { name: "Chips", qtyText: "2" },
    ]);
    expect(JSON.parse(text)).toEqual([
      { name: "Sandwich", qty: 1 },
      { name: "Chips", qty: 2 },
    ]);
  });

  it("does not repair a bad quantity into 1; the number goes through for the checks to flag", () => {
    // A quantity of 0 used to be saved as 1 without a word. It now stays 0 so
    // findComponentProblem blocks the form and the server schema refuses it.
    expect(JSON.parse(rowsToComponentsText([{ name: "Chips", qtyText: "0" }]))).toEqual([
      { name: "Chips", qty: 0 },
    ]);
    expect(JSON.parse(rowsToComponentsText([{ name: "Cookie", qtyText: "abc" }]))).toEqual([
      { name: "Cookie", qty: null },
    ]);
  });

  it("round-trips through the parser unchanged", () => {
    const original = '[{"name":"Chicken Sandwich","qty":1},{"name":"Chips","qty":1}]';
    expect(JSON.parse(rowsToComponentsText(componentsTextToRows(original)))).toEqual(JSON.parse(original));
  });
});

describe("scalingRulesTextToRows / rowsToScalingRulesText", () => {
  it("round-trips the seeded shape", () => {
    const original = '[{"label":"Sauce packets","perHeadcount":2,"perQty":0}]';
    const rows = scalingRulesTextToRows(original);
    expect(rows).toEqual([{ label: "Sauce packets", perHeadcountText: "2", perQtyText: "0" }]);
    expect(JSON.parse(rowsToScalingRulesText(rows))).toEqual(JSON.parse(original));
  });

  it("fills in a missing axis as 0 and drops blank labels", () => {
    expect(scalingRulesTextToRows('[{"label":"Napkins","perQty":1}]')).toEqual([
      { label: "Napkins", perHeadcountText: "0", perQtyText: "1" },
    ]);
    expect(JSON.parse(rowsToScalingRulesText([{ label: "  ", perHeadcountText: "3", perQtyText: "0" }]))).toEqual([]);
  });

  it("reads a blank amount as 0 but does not repair a negative or non-numeric one", () => {
    expect(
      JSON.parse(rowsToScalingRulesText([{ label: "Cups", perHeadcountText: "", perQtyText: "2" }])),
    ).toEqual([{ label: "Cups", perHeadcount: 0, perQty: 2 }]);
    // -2 stays -2 (not 0) so the checks and the server schema can refuse it.
    expect(
      JSON.parse(rowsToScalingRulesText([{ label: "Cups", perHeadcountText: "-2", perQtyText: "1" }])),
    ).toEqual([{ label: "Cups", perHeadcount: -2, perQty: 1 }]);
  });
});

describe("findComponentProblem", () => {
  it("flags a named component whose quantity is blank, zero, negative, or not a number", () => {
    for (const qtyText of ["", "0", "0.5", "-1", "abc"]) {
      expect(findComponentProblem([{ name: "Chips", qtyText }]), `qty "${qtyText}"`).toMatch(/Chips/);
    }
  });

  it("passes a quantity of 1 or more, and ignores a spare blank row", () => {
    expect(
      findComponentProblem([
        { name: "Chips", qtyText: "1" },
        { name: "Cookie", qtyText: "2.5" },
        { name: "  ", qtyText: "" },
      ]),
    ).toBeNull();
  });
});

describe("findScalingRuleProblem", () => {
  it("flags a labeled rule with no amount on either axis", () => {
    expect(findScalingRuleProblem([{ label: "Cups", perHeadcountText: "0", perQtyText: "" }])).toMatch(/Cups/);
  });

  it("flags a negative or non-numeric amount instead of treating it as 0", () => {
    expect(findScalingRuleProblem([{ label: "Cups", perHeadcountText: "-2", perQtyText: "1" }])).toMatch(/Cups/);
    expect(findScalingRuleProblem([{ label: "Cups", perHeadcountText: "x", perQtyText: "1" }])).toMatch(/numbers of 0 or more/);
  });

  it("ignores blank rows and passes a rule with one axis set", () => {
    expect(
      findScalingRuleProblem([
        { label: "", perHeadcountText: "0", perQtyText: "0" },
        { label: "Cups", perHeadcountText: "1", perQtyText: "0" },
      ]),
    ).toBeNull();
  });
});
