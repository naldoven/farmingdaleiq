import { describe, expect, it } from "vitest";
import { computeBalanceFromTransactions } from "./ledger";

describe("computeBalanceFromTransactions", () => {
  it("returns 0 for an empty ledger", () => {
    expect(computeBalanceFromTransactions([])).toBe(0);
  });

  it("sums positive and negative deltas", () => {
    const rows = [{ delta: 5 }, { delta: 20 }, { delta: -10 }];
    expect(computeBalanceFromTransactions(rows)).toBe(15);
  });
});
