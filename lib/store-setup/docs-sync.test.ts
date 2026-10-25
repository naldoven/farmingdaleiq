import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CODE_DEFAULTS, STORE_SETUP_AREAS } from "./areas";

/**
 * docs/STORE-SETUP.md is the human version of areas.ts ("keep this list in
 * step"). The first audit drifted: the doc listed a Store layout code default
 * that CODE_DEFAULTS did not have. These tests fail when the two disagree.
 */
const doc = readFileSync(path.resolve(__dirname, "..", "..", "docs", "STORE-SETUP.md"), "utf8").replace(
  /\r\n/g,
  "\n",
);

/** First-column cells of the data rows of the markdown table under `heading`. */
function firstColumn(heading: string): string[] {
  const start = doc.indexOf(`\n## ${heading}`);
  expect(start, `missing section "${heading}"`).toBeGreaterThan(-1);
  const rest = doc.slice(start + 1);
  const end = rest.indexOf("\n## ", 1);
  const section = end === -1 ? rest : rest.slice(0, end);
  return section
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2) // header row and the --- separator row
    .map((line) => line.split("|")[1].trim());
}

describe("docs/STORE-SETUP.md matches lib/store-setup/areas.ts", () => {
  it("lists every area, in registry order", () => {
    expect(firstColumn("Areas that need a manager's answer")).toEqual(STORE_SETUP_AREAS.map((a) => a.title));
  });

  it("lists exactly the code defaults the app lists", () => {
    expect(firstColumn("Defaults that live in code")).toEqual(CODE_DEFAULTS.map((d) => d.label));
  });

  it("does not claim a shift leader is locked out of money values", () => {
    expect(doc).not.toMatch(/shift leader cannot (confirm or )?change money/i);
  });

  it("carries the decision about who keeps price and cost edits", () => {
    expect(doc).toContain(
      "Decide whether Team Leaders keep catering.manage and Shift Supervisors keep waste.manage, or whether price and cost edits move to a manager role.",
    );
  });
});
