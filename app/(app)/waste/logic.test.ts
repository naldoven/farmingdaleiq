import { describe, expect, it } from "vitest";

import {
  entryCostCents,
  filterEntriesByPeriod,
  formatCentsAsUsd,
  periodStart,
  rollupByCategory,
  rollupByItem,
  storeDayRangeUtc,
  storeLocalDate,
  sumCostCents,
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
        unknownEntryCount: 0,
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
      {
        categoryId: null,
        categoryName: "Uncategorized",
        entryCount: 1,
        totalCostCents: null,
        unknownEntryCount: 1,
      },
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

describe("entryCostCents: sub-cent unit costs (regression)", () => {
  // The previous implementation snapped unit cost to whole cents FIRST
  // (Math.round(unitCost * 100)), discarding up to 0.5c per UNIT, which
  // quantity then multiplied. These are the cases that broke.
  it("does not inflate an oz-priced item", () => {
    // Math.round(0.125 * 100) = 13 -> 128 * 13 = 1664 ($16.64). True: $16.00.
    expect(entryCostCents(128, 0.125)).toBe(1600);
  });

  it("does not erase an item priced below one cent per unit", () => {
    // Math.round(0.004 * 100) = 0 -> the item vanished from cost rollups.
    expect(entryCostCents(1000, 0.004)).toBe(400);
  });

  it("does not lose a half-cent on the unit cost", () => {
    // 1.005 * 100 is 100.49999999999999 in binary float -> snapped to 100.
    expect(entryCostCents(100, 1.005)).toBe(10050);
  });

  it("still resolves the float-drift case the integer-cents change fixed", () => {
    // 1.5 * 1.15 = 1.7249999999999999; the true money value is $1.73.
    expect(entryCostCents(1.5, 1.15)).toBe(173);
  });

  it("returns null for non-finite inputs rather than rendering $NaN.NaN", () => {
    expect(entryCostCents(1, Number.NaN)).toBeNull();
    expect(entryCostCents(1, Number.POSITIVE_INFINITY)).toBeNull();
    expect(entryCostCents(Number.NaN, 1)).toBeNull();
  });
});

describe("periodStart is DST-safe", () => {
  it("subtracts exact 24h days regardless of local calendar", () => {
    const now = new Date("2026-03-15T12:00:00.000Z");
    const start = periodStart("week", now);
    expect(start?.toISOString()).toBe("2026-03-08T12:00:00.000Z");
    expect(now.getTime() - (start as Date).getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("returns null for all-time", () => {
    expect(periodStart("all", new Date())).toBeNull();
  });
});

describe("storeLocalDate", () => {
  it("uses the store's calendar day, not UTC's", () => {
    // 00:30 UTC on Aug 2 is still 8:30pm on Aug 1 in New York.
    expect(storeLocalDate(new Date("2026-08-02T00:30:00.000Z"), "America/New_York")).toBe(
      "2026-08-01",
    );
  });
});

describe("storeDayRangeUtc", () => {
  it("bounds a store-local day, not a UTC one", () => {
    const { startIso, endIso } = storeDayRangeUtc("2026-08-01", "America/New_York");
    // EDT is UTC-4, so local midnight is 04:00Z.
    expect(startIso).toBe("2026-08-01T04:00:00.000Z");
    expect(endIso).toBe("2026-08-02T04:00:00.000Z");
  });

  it("includes evening waste that the old UTC range pushed into the next day", () => {
    const { startIso, endIso } = storeDayRangeUtc("2026-08-01", "America/New_York");
    // 9pm Eastern on Aug 1 -- the closing shift. The old `${date}T00:00:00Z`
    // range ended at Aug 1 00:00Z and filed this under Aug 2.
    const closingShift = new Date("2026-08-02T01:00:00.000Z");
    expect(new Date(startIso) <= closingShift).toBe(true);
    expect(closingShift < new Date(endIso)).toBe(true);
  });

  it("handles the fall-back day (25 hours long)", () => {
    // DST ends Sun Nov 1 2026: local midnight is EDT (-4), next midnight EST (-5).
    const { startIso, endIso } = storeDayRangeUtc("2026-11-01", "America/New_York");
    expect(startIso).toBe("2026-11-01T04:00:00.000Z");
    expect(endIso).toBe("2026-11-02T05:00:00.000Z");
    expect(new Date(endIso).getTime() - new Date(startIso).getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it("handles the spring-forward day (23 hours long)", () => {
    // DST starts Sun Mar 8 2026: local midnight is EST (-5), next midnight EDT (-4).
    const { startIso, endIso } = storeDayRangeUtc("2026-03-08", "America/New_York");
    expect(startIso).toBe("2026-03-08T05:00:00.000Z");
    expect(endIso).toBe("2026-03-09T04:00:00.000Z");
    expect(new Date(endIso).getTime() - new Date(startIso).getTime()).toBe(23 * 60 * 60 * 1000);
  });
});

describe("sumCostCents", () => {
  it("reports unknown rows instead of folding them into zero", () => {
    const result = sumCostCents([
      { totalCostCents: 500 },
      { totalCostCents: null },
      { totalCostCents: 250 },
    ]);
    expect(result).toEqual({ totalCents: 750, unknownCount: 1 });
  });

  it("distinguishes an all-unknown set from a genuinely zero one", () => {
    expect(sumCostCents([{ totalCostCents: null }])).toEqual({
      totalCents: null,
      unknownCount: 1,
    });
    expect(sumCostCents([{ totalCostCents: 0 }])).toEqual({ totalCents: 0, unknownCount: 0 });
  });

  it("returns null for an empty set", () => {
    expect(sumCostCents([])).toEqual({ totalCents: null, unknownCount: 0 });
  });
});

describe("unknownEntryCount survives a mixed-cost category (regression)", () => {
  // The first attempt at the "partial total" fix keyed off a null
  // totalCostCents. But rollupByCategory only leaves that null when EVERY entry
  // in the category is un-costed, so the common real case -- one priced item
  // plus several un-priced ones -- produced a non-null total and reported zero
  // unknowns, printing a confident figure that omitted most of the waste.
  const items: WasteItemForRollup[] = [
    { id: "priced", name: "Filet", categoryId: "c1", unit: "each", unitCost: 5 },
    { id: "unpriced", name: "New item", categoryId: "c1", unit: "each", unitCost: null },
  ];
  const categories: WasteCategoryForRollup[] = [{ id: "c1", name: "Primary" }];
  const entries: WasteEntryForRollup[] = [
    { id: "e1", itemId: "priced", quantity: 2, loggedAt: daysAgo(1) },
    { id: "e2", itemId: "unpriced", quantity: 9, loggedAt: daysAgo(1) },
    { id: "e3", itemId: "unpriced", quantity: 4, loggedAt: daysAgo(1) },
  ];

  it("flags the un-costed entries even though the category total is non-null", () => {
    const rows = rollupByCategory(entries, items, categories);
    expect(rows).toHaveLength(1);
    expect(rows[0].totalCostCents).toBe(1000); // only the 2 x $5.00 is known
    expect(rows[0].unknownEntryCount).toBe(2);

    const total = sumCostCents(rows);
    expect(total).toEqual({ totalCents: 1000, unknownCount: 2 });
  });

  it("agrees with the per-item rollup", () => {
    const total = sumCostCents(rollupByItem(entries, items));
    expect(total).toEqual({ totalCents: 1000, unknownCount: 2 });
  });
});
