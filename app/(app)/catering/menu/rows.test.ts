import { describe, expect, it } from "vitest";

import {
  componentsTextToRows,
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
  it("drops blank rows and defaults a bad quantity to 1", () => {
    const text = rowsToComponentsText([
      { name: " Sandwich ", qtyText: "1" },
      { name: "", qtyText: "5" },
      { name: "Cookie", qtyText: "abc" },
      { name: "Chips", qtyText: "0" },
    ]);
    expect(JSON.parse(text)).toEqual([
      { name: "Sandwich", qty: 1 },
      { name: "Cookie", qty: 1 },
      { name: "Chips", qty: 1 },
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

  it("treats a negative or non-numeric amount as 0", () => {
    expect(
      JSON.parse(rowsToScalingRulesText([{ label: "Cups", perHeadcountText: "-2", perQtyText: "x" }])),
    ).toEqual([{ label: "Cups", perHeadcount: 0, perQty: 0 }]);
  });
});

describe("findScalingRuleProblem", () => {
  it("flags a labeled rule with no amount on either axis", () => {
    expect(findScalingRuleProblem([{ label: "Cups", perHeadcountText: "0", perQtyText: "" }])).toMatch(/Cups/);
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
