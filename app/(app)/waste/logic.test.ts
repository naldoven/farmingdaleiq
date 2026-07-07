import { describe, expect, it } from "vitest";

import {
  filterEntriesByPeriod,
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
        totalCost: 10,
      },
    ]);
  });

  it("leaves totalCost null when the item has no unit cost", () => {
    const entries: WasteEntryForRollup[] = [
      { id: "e1", itemId: "i2", quantity: 6, loggedAt: daysAgo(1) },
    ];
    const rollup = rollupByItem(entries, items);
    expect(rollup[0].totalCost).toBeNull();
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
    expect(meat.totalCost).toBe(9);
  });

  it("groups items with no category under 'Uncategorized'", () => {
    const entries: WasteEntryForRollup[] = [
      { id: "e1", itemId: "i4", quantity: 1, loggedAt: daysAgo(1) },
    ];
    const rollup = rollupByCategory(entries, items, categories);
    expect(rollup).toEqual([
      { categoryId: null, categoryName: "Uncategorized", entryCount: 1, totalCost: null },
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
