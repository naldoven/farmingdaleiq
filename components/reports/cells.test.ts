import { describe, expect, it } from "vitest";

import { cellCsvValue, formatDate, formatDateTime, formatPercent } from "./cells";

/**
 * The reporting CSV export shares one derivation path with the on-screen
 * display (components/reports/cells.ts). These tests pin the CSV value each
 * CellFormat produces so a refactor can't silently change what a downloaded
 * report contains.
 */
describe("cellCsvValue", () => {
  it("returns a plain text value as-is", () => {
    expect(cellCsvValue({ value: "Waffle fries" }, "text")).toBe("Waffle fries");
  });

  it("returns a number value as-is for the number format", () => {
    expect(cellCsvValue({ value: 42 }, "number")).toBe(42);
  });

  it("prefers an explicit csv override over the raw value (e.g. a $-formatted cost)", () => {
    expect(cellCsvValue({ value: "$12.50", csv: 12.5 }, "text")).toBe(12.5);
  });

  it("honors an explicit null csv override rather than deriving from value", () => {
    expect(cellCsvValue({ value: "—", csv: null }, "text")).toBe(null);
  });

  it("exports a percent format as a whole number, not the 0..1 ratio", () => {
    expect(cellCsvValue({ value: 0.5 }, "percent")).toBe(50);
    expect(cellCsvValue({ value: 2 / 3 }, "percent")).toBe(67);
  });

  it("exports the overdue format as yes/no", () => {
    expect(cellCsvValue({ value: true }, "overdue")).toBe("yes");
    expect(cellCsvValue({ value: false }, "overdue")).toBe("no");
  });

  it("exports a badge format as its raw status token, not the spaced label", () => {
    expect(cellCsvValue({ value: "in_progress" }, "badge")).toBe("in_progress");
    expect(cellCsvValue({ value: null }, "badge")).toBe("");
  });

  it("exports datetime/date formats as the localized string", () => {
    const iso = "2026-07-07T12:00:00.000Z";
    expect(cellCsvValue({ value: iso }, "datetime")).toBe(new Date(iso).toLocaleString());
    expect(cellCsvValue({ value: iso }, "date")).toBe(new Date(iso).toLocaleDateString());
  });

  it("renders a null value as an empty cell for text/number", () => {
    expect(cellCsvValue({ value: null }, "text")).toBe("");
    expect(cellCsvValue({ value: null }, "number")).toBe("");
  });
});

describe("format helpers", () => {
  it("formatDateTime returns a dash for null/empty/invalid input", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("")).toBe("—");
    expect(formatDateTime("not a date")).toBe("—");
  });

  it("formatDate returns a dash for null input", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("formatPercent rounds a 0..1 ratio to a whole-number percentage", () => {
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(2 / 3)).toBe("67%");
    expect(formatPercent(null)).toBe("—");
  });
});
