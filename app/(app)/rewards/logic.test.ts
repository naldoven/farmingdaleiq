import { describe, expect, it } from "vitest";

import { canClaim, claimBlockedLabel, whyCantClaim } from "@/app/(app)/rewards/logic";

describe("whyCantClaim", () => {
  it("returns null when the reward is claimable", () => {
    expect(whyCantClaim({ active: true, stock: 5, tokenCost: 25 }, 30)).toBeNull();
  });

  it("flags an inactive reward first", () => {
    expect(whyCantClaim({ active: false, stock: 0, tokenCost: 25 }, 5)).toBe("inactive");
  });

  it("flags out of stock when stock is exactly 0", () => {
    expect(whyCantClaim({ active: true, stock: 0, tokenCost: 25 }, 100)).toBe("out_of_stock");
  });

  it("treats null stock as unlimited", () => {
    expect(whyCantClaim({ active: true, stock: null, tokenCost: 25 }, 25)).toBeNull();
  });

  it("flags insufficient balance", () => {
    expect(whyCantClaim({ active: true, stock: 5, tokenCost: 25 }, 10)).toBe("insufficient_balance");
  });

  it("allows a claim that exactly matches the balance", () => {
    expect(whyCantClaim({ active: true, stock: 1, tokenCost: 25 }, 25)).toBeNull();
  });
});

describe("canClaim", () => {
  it("mirrors whyCantClaim as a boolean", () => {
    expect(canClaim({ active: true, stock: 5, tokenCost: 25 }, 30)).toBe(true);
    expect(canClaim({ active: true, stock: 0, tokenCost: 25 }, 30)).toBe(false);
  });
});

describe("claimBlockedLabel", () => {
  it("returns null for an unblocked reason", () => {
    expect(claimBlockedLabel(null)).toBeNull();
  });

  it("labels each blocked reason", () => {
    expect(claimBlockedLabel("inactive")).toBe("Not available");
    expect(claimBlockedLabel("out_of_stock")).toBe("Out of stock");
    expect(claimBlockedLabel("insufficient_balance")).toBe("Not enough tokens");
  });
});
