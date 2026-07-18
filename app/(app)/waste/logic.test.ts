import { describe, expect, it } from "vitest";

import {
  entryCostCents,
  filterEntriesByPeriod,
  formatCentsAsUsd,
  periodStart,
  rollupByCategory,
  rollupByItem,
  type WasteCategoryForRollup,
  type WasteEntryForRollup,
  type WasteItemForRollup,
} from "@/app/(app)/waste/logic";

const NOW = new Date("2026-07-07T12:00:00.000Z");

function daysAgo(days: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

describe("periodStart", () => {
  it("returns null for 'all' (no lower bound)", () => {
    expect(periodStart("all", NOW)).toBeNull();
  });

  it("returns 7 days back for 'week'", () => {
    const start = periodStart("week", NOW)!;
    expect(start.toISOString()).toBe(daysAgo(7));
  });

  it("returns 30 days back for 'month'", () => {
    const start = periodStart("month", NOW)!;
    expect(start.toISOString()).toBe(daysAgo(30));
  });

  it("returns 90 days back for 'quarter'", () => {
    const start = periodStart("quarter", NOW)!;
    expect(start.toISOString()).toBe(daysAgo(90));
  });
});

describe("filterEntriesByPeriod", () => {
  const entries: WasteEntryForRollup[] = [
    { id: "e1", itemId: "i1", quantity: 1, loggedAt: daysAgo(1) },
    { id: "e2", itemId: "i1", quantity: 2, loggedAt: daysAgo(10) },
    { id: "e3", itemId: "i1", quantity: 3, loggedAt: daysAgo(45) },
    { id: "e4", itemId: "i1", quantity: 4, loggedAt: daysAgo(120) },
  ];

  it("keeps only entries within the last 7 days for 'week'", () => {
    const result = filterEntriesByPeriod(entries, "week", NOW);
    expect(result.map((e) => e.id)).toEqual(["e1"]);
  });

  it("keeps entries within the last 30 days for 'month'", () => {
    const result = filterEntriesByPeriod(entries, "month", NOW);
    expect(result.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("keeps entries within the last 90 days for 'quarter'", () => {
    const result = filterEntriesByPeriod(entries, "quarter", NOW);
    expect(result.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("keeps everything for 'all'", () => {
    const result = filterEntriesByPeriod(entries, "all", NOW);
    expect(result.map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4"]);
  });

  it("excludes entries logged after 'now' (clock skew / bad data)", () => {
    const future: WasteEntryForRollup[] = [
      { id: "future", itemId: "i1", quantity: 1, loggedAt: "2099-01-01T00:00:00.000Z" },
    ];
    expect(filterEntriesByPeriod(future, "all", NOW)).toEqual([]);
  });
});

describe("rollupByItem", () => {
  const items: WasteItemForRollup[] = [
    { id: "i1", name: "Chicken breast", categoryId: "c1", unit: "lb", unitCost: 2 },
    { id: "i2", name: "Buns", categoryId: "c1", unit: "each", unitCost: null },
  ];

  it("sums quantity and entry count per item", () => {
    const entries: WasteEntryForRollup[] = [
      { id: "e1", itemId: "i1", quantity: 3, loggedAt: daysAgo(1) },
      { id: "e2", itemId: "i1", quantity: 2, loggedAt: daysAgo(2) },
    ];
    const rollup = rollupByItem(entries, items);
    expect(rollup).toEqual([
      {
        itemId: "i1",
        itemName: "Chicken breast",
        unit: "lb",
        totalQuantity: 5,
        entryCount: 2,
        totalCostCents: 1000,
      },
    ]);
  });

  it("leaves totalCostCents null when the item has no unit cost", () => {
    const entries: WasteEntryForRollup[] = [
      { id: "e1", itemId: "i2", quantity: 6, loggedAt: daysAgo(1) },
    ];
    const rollup = rollupByItem(entries, items);
    expect(rollup[0].totalCostCents).toBeNull();
    expect(rollup[0].totalQuantity).toBe(6);
  });

  it("sorts by total quantity descending", () => {
    const entries: WasteEntryForRollup[] = [
      { id: "e1", itemId: "i2", quantity: 1, loggedAt: daysAgo(1) },
      { id: "e2", itemId: "i1", quantity: 10, loggedAt: daysAgo(1) },
    ];
    const rollup = rollupByItem(entries, items);
    expect(rollup.map((r) => r.itemId)).toEqual(["i1", "i2"]);
  });

  it("skips entries referencing an unknown item id instead of throwing", () => {
    const entries: WasteEntryForRollup[] = [
      { id: "e1", itemId: "does-not-exist", quantity: 1, loggedAt: daysAgo(1) },
    ];
    expect(rollupByItem(entries, items)).toEqual([]);
  });
});

describe("rollupByCategory", () => {
  const categories: WasteCategoryForRollup[] = [
    { id: "c1", name: "Meat" },
    { id: "c2", name: "Produce" },
  ];
  const items: WasteItemForRollup[] = [
    { id: "i1", name: "Chicken breast", categoryId: "c1", unit: "lb", unitCost: 2 },
    { id: "i2", name: "Filet strips", categoryId: "c1", unit: "each", unitCost: 0.5 },
    { id: "i3", name: "Lettuce", categoryId: "c2", unit: "lb", unitCost: 1 },
    { id: "i4", name: "Misc", categoryId: null, unit: "each", unitCost: null },
  ];

  it("sums cost across items with different units within one category", () => {
    const entries: WasteEntryForRollup[] = [
      { id: "e1", itemId: "i1", quantity: 2, loggedAt: daysAgo(1) }, // 2 * 2 = 4
      { id: "e2", itemId: "i2", quantity: 10, loggedAt: daysAgo(1) }, // 10 * 0.5 = 5
    ];
    const rollup = rollupByCategory(entries, items, categories);
    const meat = rollup.find((r) => r.categoryId === "c1")!;
    expect(meat.entryCount).toBe(2);
    expect(meat.totalCostCents).toBe(900);
  });

  it("groups items with no category under 'Uncategorized'", () => {
    const entries: WasteEntryForRollup[] = [
      { id: "e1", itemId: "i4", quantity: 1, loggedAt: daysAgo(1) },
    ];
    const rollup = rollupByCategory(entries, items, categories);
    expect(rollup).toEqual([
      { categoryId: null, categoryName: "Uncategorized", entryCount: 1, totalCostCents: null },
    ]);
  });

  it("sorts by total cost descending, nulls treated as zero", () => {
    const entries: WasteEntryForRollup[] = [
      { id: "e1", itemId: "i3", quantity: 5, loggedAt: daysAgo(1) }, // Produce: 5
      { id: "e2", itemId: "i1", quantity: 10, loggedAt: daysAgo(1) }, // Meat: 20
      { id: "e3", itemId: "i4", quantity: 1, loggedAt: daysAgo(1) }, // Uncategorized: null
    ];
    const rollup = rollupByCategory(entries, items, categories);
    expect(rollup.map((r) => r.categoryName)).toEqual(["Meat", "Produce", "Uncategorized"]);
  });
});

describe("entryCostCents (money is computed once, in integer cents)", () => {
  it("returns null when the item has no unit cost (unknown, not zero)", () => {
    expect(entryCostCents(5, null)).toBeNull();
  });

  it("rounds 1.5 x $1.15 up to 173 cents, not the 172 a naive float gives", () => {
    // (1.5 * 1.15) === 1.7249999999999999 in binary float, so
    // (1.5 * 1.15).toFixed(2) is "1.72". Snapping the unit cost to whole
    // cents first (115) makes Math.round(1.5 * 115) === 173 -> $1.73.
    expect(entryCostCents(1.5, 1.15)).toBe(173);
  });

  it("stays exact for a 0.1 + 0.2 style set once summed as integers", () => {
    // Float: 0.1*0.2 + 0.2*0.2 === 0.06000000000000001. In cents it is exact.
    const a = entryCostCents(0.1, 0.2)!;
    const b = entryCostCents(0.2, 0.2)!;
    expect(a).toBe(2);
    expect(b).toBe(4);
    expect(a + b).toBe(6);
  });

  it("treats a zero unit cost as 0 cents, never NaN or null", () => {
    expect(entryCostCents(10, 0)).toBe(0);
  });
});

describe("formatCentsAsUsd", () => {
  it("formats integer cents as dollars with two decimals", () => {
    expect(formatCentsAsUsd(173)).toBe("$1.73");
    expect(formatCentsAsUsd(0)).toBe("$0.00");
    expect(formatCentsAsUsd(5)).toBe("$0.05");
    expect(formatCentsAsUsd(100000)).toBe("$1000.00");
  });

  it("uses one shared placeholder for a null (no-cost) value", () => {
    expect(formatCentsAsUsd(null)).toBe("—");
  });
});

describe("rollupByItem and rollupByCategory agree to the cent", () => {
  const categories: WasteCategoryForRollup[] = [{ id: "c1", name: "Meat" }];
  const items: WasteItemForRollup[] = [
    { id: "i1", name: "A", categoryId: "c1", unit: "lb", unitCost: 1.15 },
    { id: "i2", name: "B", categoryId: "c1", unit: "each", unitCost: 0.33 },
  ];
  // Fractional quantities against odd unit costs: exactly the set where naive
  // per-item rounding vs round-of-sum can drift a cent between the two tables.
  const entries: WasteEntryForRollup[] = [
    { id: "e1", itemId: "i1", quantity: 1.5, loggedAt: daysAgo(1) },
    { id: "e2", itemId: "i1", quantity: 0.5, loggedAt: daysAgo(1) },
    { id: "e3", itemId: "i2", quantity: 3, loggedAt: daysAgo(1) },
  ];

  it("produces the same grand total from both rollups", () => {
    const byItem = rollupByItem(entries, items);
    const byCategory = rollupByCategory(entries, items, categories);
    const itemTotal = byItem.reduce((sum, r) => sum + (r.totalCostCents ?? 0), 0);
    const categoryTotal = byCategory.reduce((sum, r) => sum + (r.totalCostCents ?? 0), 0);
    // i1: round(1.5*115)=173 + round(0.5*115)=58 = 231; i2: round(3*33)=99.
    expect(itemTotal).toBe(330);
    expect(categoryTotal).toBe(330);
    expect(itemTotal).toBe(categoryTotal);
  });
});
