import { describe, expect, it } from "vitest";

import { escapeCsvCell, toCsv } from "./csv";

describe("escapeCsvCell", () => {
  it("passes through a plain string unchanged", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
  });

  it("converts null and undefined to an empty cell", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("stringifies numbers and booleans", () => {
    expect(escapeCsvCell(42)).toBe("42");
    expect(escapeCsvCell(0)).toBe("0");
    expect(escapeCsvCell(true)).toBe("true");
  });

  it("quotes a value containing a comma", () => {
    expect(escapeCsvCell("Smith, John")).toBe('"Smith, John"');
  });

  it("quotes and doubles embedded quotes", () => {
    expect(escapeCsvCell('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("quotes a value containing a newline", () => {
    expect(escapeCsvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("neutralizes a formula-injection cell (=HYPERLINK) with a leading quote", () => {
    expect(escapeCsvCell('=HYPERLINK("http://evil","click")')).toBe(
      '"\'=HYPERLINK(""http://evil"",""click"")"',
    );
  });

  it("neutralizes leading +, -, @ on string cells", () => {
    expect(escapeCsvCell("+1-800-EVIL")).toBe("'+1-800-EVIL");
    expect(escapeCsvCell("@SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
    expect(escapeCsvCell("-2+3")).toBe("'-2+3");
  });

  it("does not alter genuine negative numbers (numeric type, not string)", () => {
    expect(escapeCsvCell(-5)).toBe("-5");
  });
});

describe("toCsv", () => {
  it("builds a header row plus one row per data row", () => {
    const csv = toCsv(
      ["Name", "Count"],
      [
        ["Waffle fries", 3],
        ["Nuggets", 12],
      ],
    );
    expect(csv).toBe("Name,Count\r\nWaffle fries,3\r\nNuggets,12");
  });

  it("returns just the header row for an empty data set", () => {
    expect(toCsv(["A", "B"], [])).toBe("A,B");
  });

  it("escapes cells that need it within a full document", () => {
    const csv = toCsv(["Note"], [["contains, a comma"]]);
    expect(csv).toBe('Note\r\n"contains, a comma"');
  });

  it("renders null cells as empty", () => {
    const csv = toCsv(["A", "B"], [[null, "x"]]);
    expect(csv).toBe("A,B\r\n,x");
  });
});
