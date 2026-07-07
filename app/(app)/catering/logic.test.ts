import { describe, expect, it } from "vitest";

import {
  computeAnalytics,
  computeContactRollups,
  computeKitchenPrepItems,
  computeScaledSetupItems,
  currentWeekDates,
  defaultFollowUpDueDate,
  formatScaledLabel,
  isoWeekKey,
  parseComponents,
  parseScalingRules,
  periodRange,
  planChecklistMaterialization,
} from "@/app/(app)/catering/logic";

describe("parseComponents", () => {
  it("accepts plain string entries with an implicit qty of 1", () => {
    expect(parseComponents(["Sandwich", "Chips"])).toEqual([
      { name: "Sandwich", qty: 1 },
      { name: "Chips", qty: 1 },
    ]);
  });

  it("accepts object entries with an explicit qty", () => {
    expect(parseComponents([{ name: "Nugget", qty: 8 }])).toEqual([
      { name: "Nugget", qty: 8 },
    ]);
  });

  it("ignores malformed entries and non-array input", () => {
    expect(parseComponents([{ qty: 5 }, "", 42, null])).toEqual([]);
    expect(parseComponents(null)).toEqual([]);
    expect(parseComponents(undefined)).toEqual([]);
    expect(parseComponents("not an array")).toEqual([]);
  });
});

describe("parseScalingRules", () => {
  it("parses per-headcount and per-qty rules", () => {
    expect(
      parseScalingRules([{ label: "Sauce packets", perHeadcount: 2, perQty: 1 }]),
    ).toEqual([{ label: "Sauce packets", perHeadcount: 2, perQty: 1 }]);
  });

  it("defaults missing multipliers to 0 and drops entries without a label", () => {
    expect(parseScalingRules([{ label: "Napkins" }, { perHeadcount: 1 }])).toEqual([
      { label: "Napkins", perHeadcount: 0, perQty: 0 },
    ]);
  });
});

describe("computeScaledSetupItems", () => {
  const menuItemsById = {
    tray: {
      components: null,
      scaling_rules: [{ label: "Sauce packets", perHeadcount: 2, perQty: 0 }],
    },
    boxed: {
      components: null,
      scaling_rules: [
        { label: "Napkins", perHeadcount: 0, perQty: 1 },
        { label: "Sauce packets", perHeadcount: 0, perQty: 2 },
      ],
    },
  };

  it("scales by headcount and sums duplicate labels across line items", () => {
    const result = computeScaledSetupItems(
      [
        { menuItemId: "tray", qty: 1 },
        { menuItemId: "boxed", qty: 20 },
      ],
      menuItemsById,
      20,
    );
    expect(result).toEqual([
      { label: "Napkins", qty: 20 },
      { label: "Sauce packets", qty: 80 }, // 2*20 (tray, headcount) + 2*20 (boxed, per qty)
    ]);
  });

  it("returns nothing for zero headcount and no per-qty rules", () => {
    const result = computeScaledSetupItems([{ menuItemId: "tray", qty: 1 }], menuItemsById, 0);
    expect(result).toEqual([]);
  });

  it("ignores order items with no matching menu item", () => {
    const result = computeScaledSetupItems([{ menuItemId: "missing", qty: 5 }], menuItemsById, 10);
    expect(result).toEqual([]);
  });
});

describe("computeKitchenPrepItems", () => {
  it("expands a packaged meal into its components, scaled by line qty", () => {
    const menuItemsById = {
      boxed: {
        components: [{ name: "Chicken Sandwich", qty: 1 }, { name: "Chips", qty: 1 }, "Cookie"],
        scaling_rules: null,
      },
    };
    const result = computeKitchenPrepItems([{ menuItemId: "boxed", qty: 15 }], menuItemsById);
    expect(result).toEqual([
      { label: "Chicken Sandwich", qty: 15 },
      { label: "Chips", qty: 15 },
      { label: "Cookie", qty: 15 },
    ]);
  });

  it("sums the same component across multiple line items", () => {
    const menuItemsById = {
      a: { components: [{ name: "Nugget", qty: 8 }], scaling_rules: null },
      b: { components: ["Nugget"], scaling_rules: null },
    };
    const result = computeKitchenPrepItems(
      [
        { menuItemId: "a", qty: 2 },
        { menuItemId: "b", qty: 3 },
      ],
      menuItemsById,
    );
    expect(result).toEqual([{ label: "Nugget", qty: 19 }]); // 8*2 + 1*3
  });
});

describe("formatScaledLabel", () => {
  it("bakes the quantity into the label text", () => {
    expect(formatScaledLabel({ label: "Sauce packets", qty: 40 })).toBe("Sauce packets — 40");
  });
});

describe("planChecklistMaterialization", () => {
  const defaults = [
    { stage: "confirm", label: "Called guest to confirm", sort: 0 },
    { stage: "setup", label: "Serving utensils out", sort: 0 },
    { stage: "kitchen_prep", label: "Food items prepped", sort: 0 },
    { stage: "out", label: "Tender count confirmed", sort: 0 },
    { stage: "setup", label: "inactive item should not appear", sort: 1 },
  ];
  const menuItemsById = {
    boxed: {
      components: [{ name: "Chicken Sandwich", qty: 1 }],
      scaling_rules: [{ label: "Napkins", perHeadcount: 0, perQty: 2 }],
    },
  };

  it("includes stage defaults plus auto-scaled setup and kitchen_prep items", () => {
    const planned = planChecklistMaterialization({
      defaults: defaults.filter((d) => d.label !== "inactive item should not appear"),
      orderItems: [{ menuItemId: "boxed", qty: 10 }],
      menuItemsById,
      headcount: 10,
    });

    const byStage = (stage: string) => planned.filter((p) => p.stage === stage).map((p) => p.label);

    expect(byStage("confirm")).toEqual(["Called guest to confirm"]);
    expect(byStage("setup")).toEqual(["Serving utensils out", "Napkins — 20"]);
    expect(byStage("kitchen_prep")).toEqual(["Food items prepped", "Chicken Sandwich — 10"]);
    expect(byStage("out")).toEqual(["Tender count confirmed"]);
  });

  it("assigns sequential sort values within each stage", () => {
    const planned = planChecklistMaterialization({
      defaults: defaults.filter((d) => d.label !== "inactive item should not appear"),
      orderItems: [],
      menuItemsById: {},
      headcount: 0,
    });
    const setupItems = planned.filter((p) => p.stage === "setup");
    expect(setupItems.map((p) => p.sort)).toEqual([0]);
  });
});

describe("periodRange", () => {
  const now = new Date("2026-07-15T12:00:00Z");

  it("returns null lower bound for 'all'", () => {
    expect(periodRange("all", now)).toEqual({ from: null, to: "2026-07-15" });
  });

  it("returns the first of the month for 'month'", () => {
    expect(periodRange("month", now)).toEqual({ from: "2026-07-01", to: "2026-07-15" });
  });

  it("returns the start of the quarter for 'quarter'", () => {
    expect(periodRange("quarter", now)).toEqual({ from: "2026-07-01", to: "2026-07-15" });
    expect(periodRange("quarter", new Date("2026-02-01T00:00:00Z"))).toEqual({
      from: "2026-01-01",
      to: "2026-02-01",
    });
  });

  it("returns Jan 1 for 'year'", () => {
    expect(periodRange("year", now)).toEqual({ from: "2026-01-01", to: "2026-07-15" });
  });
});

describe("computeContactRollups", () => {
  it("aggregates order count, lifetime spend, and the latest event date per contact", () => {
    const rollups = computeContactRollups([
      { id: "1", contact_id: "c1", amount: 100, event_date: "2026-01-01" },
      { id: "2", contact_id: "c1", amount: 250, event_date: "2026-03-01" },
      { id: "3", contact_id: "c2", amount: 50, event_date: "2026-02-01" },
      { id: "4", contact_id: null, amount: 999, event_date: "2026-01-01" },
    ]);
    expect(rollups.get("c1")).toEqual({
      orderCount: 2,
      lifetimeSpend: 350,
      lastEventDate: "2026-03-01",
    });
    expect(rollups.get("c2")).toEqual({
      orderCount: 1,
      lifetimeSpend: 50,
      lastEventDate: "2026-02-01",
    });
    expect(rollups.has(null as unknown as string)).toBe(false);
  });

  it("treats a null amount as zero spend", () => {
    const rollups = computeContactRollups([
      { id: "1", contact_id: "c1", amount: null, event_date: "2026-01-01" },
    ]);
    expect(rollups.get("c1")?.lifetimeSpend).toBe(0);
  });
});

describe("isoWeekKey", () => {
  it("matches known ISO week numbers", () => {
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01");
    expect(isoWeekKey("2025-12-29")).toBe("2026-W01");
  });
});

describe("computeAnalytics", () => {
  const contacts = [
    { id: "c1", name: "Alice" },
    { id: "c2", name: "Bob" },
  ];
  const orders = [
    { id: "1", contact_id: "c1", amount: 100, event_date: "2026-01-05" }, // Monday
    { id: "2", contact_id: "c1", amount: 200, event_date: "2026-01-12" }, // Monday
    { id: "3", contact_id: "c2", amount: 50, event_date: "2026-01-06" }, // Tuesday
  ];

  it("computes totals, average, and repeat-guest percentage", () => {
    const result = computeAnalytics(orders, contacts);
    expect(result.totalOrders).toBe(3);
    expect(result.totalRevenue).toBe(350);
    expect(result.averageOrder).toBeCloseTo(116.67, 1);
    expect(result.repeatGuestPercentage).toBeCloseTo(50, 5); // 1 of 2 contacts repeats
  });

  it("ranks top guests by lifetime spend", () => {
    const result = computeAnalytics(orders, contacts);
    expect(result.topGuests[0]).toEqual({
      contactId: "c1",
      name: "Alice",
      lifetimeSpend: 300,
      orderCount: 2,
    });
  });

  it("returns zeroed figures for no orders", () => {
    const result = computeAnalytics([], []);
    expect(result.totalOrders).toBe(0);
    expect(result.totalRevenue).toBe(0);
    expect(result.averageOrder).toBe(0);
    expect(result.repeatGuestPercentage).toBe(0);
    expect(result.topGuests).toEqual([]);
  });
});

describe("currentWeekDates", () => {
  it("returns 7 consecutive dates starting on Sunday", () => {
    // 2026-07-15 is a Wednesday
    const dates = currentWeekDates(new Date("2026-07-15T12:00:00Z"));
    expect(dates).toEqual([
      "2026-07-12",
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
      "2026-07-16",
      "2026-07-17",
      "2026-07-18",
    ]);
  });
});

describe("defaultFollowUpDueDate", () => {
  it("adds 30 days to the event date", () => {
    expect(defaultFollowUpDueDate("2026-01-01")).toBe("2026-01-31");
  });
});
