import { describe, expect, it } from "vitest";

import {
  computeAnalytics,
  buildPhysicalOrderSetup,
  computeContactRollups,
  computeKitchenPrepItems,
  computeScaledSetupItems,
  countsAsRevenue,
  currentWeekDates,
  defaultFollowUpDueDate,
  filterRevenueOrders,
  formatOrderNewMessage,
  formatScaledLabel,
  formatStageChangeMessage,
  isCateringFollowUpDue,
  isoWeekKey,
  normalizePhone,
  parseComponents,
  parseOrderItemsFromNotes,
  parseRequestedCateringSauces,
  parseScalingRules,
  periodRange,
  planChecklistMaterialization,
  storeLocalDate,
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

describe("physical catering setup", () => {
  it("uses headcount for paper goods, exact requested sauces, and twelve cups for each gallon drink", () => {
    const result = buildPhysicalOrderSetup({
      items: [
        { name: "Small Hot Chick-fil-A Nuggets Tray", qty: 2 },
        { name: "Small Mac & Cheese Tray", qty: 2 },
        { name: "Small Garden Salad Tray", qty: 4 },
        { name: "Gallon Chick-fil-A Lemonade", qty: 1 },
        { name: "Gallon Freshly-Brewed Iced Tea Sweetened", qty: 1 },
      ],
      headcount: 25,
      paperGoods: true,
      fulfillment: "delivery",
      requestedSauceLabels: parseRequestedCateringSauces(
        "Requested sauces: Polynesian Sauce and Garden Herb Ranch dressing.",
      ),
    });

    expect(result).toContainEqual({ section: "paper_goods", label: "Plates", qty: 25 });
    expect(result).toContainEqual({ section: "paper_goods", label: "Cups", qty: 25 });
    expect(result).toContainEqual({ section: "paper_goods", label: "Cutlery sets", qty: 25 });
    expect(result).toContainEqual({ section: "beverages", label: "Drink cups", qty: 24 });
    expect(result).toContainEqual({ section: "paper_goods", label: "Serving spoons", qty: 4 });
    expect(result).toContainEqual({ section: "paper_goods", label: "Tongs", qty: 4 });
    expect(result).toContainEqual({ section: "sauces", label: "Polynesian Sauce packets", qty: 16 });
    expect(result).toContainEqual({ section: "sauces", label: "Garden Herb Ranch dressing", qty: 24 });
    expect(result.some((item) => item.label === "Small Hot Chick-fil-A Nuggets Tray")).toBe(false);
  });

  it("does not add cups, plates, or cutlery when paper goods are declined", () => {
    const result = buildPhysicalOrderSetup({
      items: [
        { name: "Large Fruit Tray", qty: 1 },
        { name: "Gallon Chick-fil-A Lemonade", qty: 1 },
      ],
      headcount: 100,
      paperGoods: false,
      fulfillment: "pickup",
    });

    expect(result.some((item) => item.label === "Plates")).toBe(false);
    expect(result.some((item) => item.label === "Cups")).toBe(false);
    expect(result.some((item) => item.label === "Cutlery sets")).toBe(false);
    expect(result.some((item) => item.label === "Drink cups")).toBe(false);
    expect(result).toContainEqual({ section: "paper_goods", label: "Serving spoons", qty: 2 });
  });

  it("uses the tray guide for Southwest Veggie wraps and twelve cups for 96 oz coffee", () => {
    const result = buildPhysicalOrderSetup({
      items: [
        { name: "Medium Southwest Veggie Wrap Tray", qty: 1 },
        { name: "Regular 96 oz Coffee", qty: 1 },
      ],
      headcount: 20,
      paperGoods: true,
      fulfillment: "pickup",
      requestedSauceLabels: parseRequestedCateringSauces("Creamy Salsa dressing requested"),
    });

    expect(result).toContainEqual({ section: "paper_goods", label: "Tongs", qty: 1 });
    expect(result).toContainEqual({ section: "sauces", label: "Creamy Salsa dressing", qty: 10 });
    expect(result).toContainEqual({ section: "beverages", label: "Drink cups", qty: 12 });
  });

  it("adds no sauce without a customer request and excludes incompatible requested options", () => {
    const result = buildPhysicalOrderSetup({
      items: [{ name: "Small Hot Chick-fil-A Nuggets Tray", qty: 1 }],
      headcount: 0,
      paperGoods: false,
      fulfillment: "pickup",
      requestedSauceLabels: parseRequestedCateringSauces("Garden Herb Ranch dressing. No Sauce."),
    });

    expect(result.some((item) => item.section === "sauces")).toBe(false);
  });

  it("recognizes exact customer selections from the receipt text", () => {
    expect(
      parseRequestedCateringSauces(
        "Selections: 8oz Chick-fil-A Sauce, Honey Roasted BBQ, Avocado Lime Ranch, and Strawberry Jelly. No Sauce.",
      ),
    ).toEqual([
      "Honey Roasted BBQ sauce packets",
      "8 oz Chick-fil-A Sauce bottles",
      "Avocado Lime Ranch dressing",
      "Strawberry jelly",
    ]);
  });

  it("keeps receipt item names available even when the catalog did not match them", () => {
    expect(
      parseOrderItemsFromNotes(
        "Auto-created from CFA order #04093 email.\n\nItems:\n- 1x Large Hot Chick-fil-A Nuggets Tray ($167.50)\n- 1x 8oz Chick-fil-A Sauce\n\nSubtotal $167.50",
      ),
    ).toEqual([
      { name: "Large Hot Chick-fil-A Nuggets Tray", qty: 1 },
      { name: "8oz Chick-fil-A Sauce", qty: 1 },
    ]);
  });
});

describe("isCateringFollowUpDue", () => {
  const scheduledOrder = {
    stage: "out",
    event_date: "2026-08-20",
    event_time: "14:00:00",
  };

  it("moves an active handoff at its scheduled New York time", () => {
    expect(isCateringFollowUpDue(scheduledOrder, new Date("2026-08-20T18:00:00.000Z"))).toBe(true);
    expect(isCateringFollowUpDue(scheduledOrder, new Date("2026-08-20T17:59:59.999Z"))).toBe(false);
  });

  it("does not advance other stages or orders without a scheduled time", () => {
    expect(isCateringFollowUpDue({ ...scheduledOrder, stage: "setup" }, new Date("2026-08-20T19:00:00.000Z"))).toBe(false);
    expect(isCateringFollowUpDue({ ...scheduledOrder, event_time: null }, new Date("2026-08-20T19:00:00.000Z"))).toBe(false);
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

  it("includes stage defaults and kitchen prep items while waiting for confirmation to build the physical setup", () => {
    const planned = planChecklistMaterialization({
      defaults: defaults.filter((d) => d.label !== "inactive item should not appear"),
      orderItems: [{ menuItemId: "boxed", qty: 10 }],
      menuItemsById,
      headcount: 10,
    });

    const byStage = (stage: string) => planned.filter((p) => p.stage === stage).map((p) => p.label);

    expect(byStage("confirm")).toEqual(["Called guest to confirm"]);
    expect(byStage("setup")).toEqual([]);
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
    const kitchenItems = planned.filter((p) => p.stage === "kitchen_prep");
    expect(kitchenItems.map((p) => p.sort)).toEqual([0]);
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
      to: "2026-01-31",
    });
  });

  it("returns Jan 1 for 'year'", () => {
    expect(periodRange("year", now)).toEqual({ from: "2026-01-01", to: "2026-07-15" });
  });

  it("uses the New York calendar before UTC midnight", () => {
    expect(periodRange("month", new Date("2026-08-01T00:30:00Z"))).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
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

  it("keeps the current week on the New York calendar near midnight UTC", () => {
    expect(currentWeekDates(new Date("2026-08-02T00:30:00Z"))[0]).toBe("2026-07-26");
  });
});

describe("defaultFollowUpDueDate", () => {
  it("adds 30 days to the event date", () => {
    expect(defaultFollowUpDueDate("2026-01-01")).toBe("2026-01-31");
  });
});

describe("storeLocalDate", () => {
  it("returns the store-local calendar date even when UTC has already rolled to the next day", () => {
    // 2026-07-15T02:30:00Z is still 2026-07-14 22:30 in America/New_York.
    const now = new Date("2026-07-15T02:30:00Z");
    expect(storeLocalDate(now, "America/New_York")).toBe("2026-07-14");
    expect(storeLocalDate(now, "UTC")).toBe("2026-07-15");
  });
});

describe("normalizePhone", () => {
  it("strips formatting so differently formatted numbers compare equal", () => {
    expect(normalizePhone("(555) 123-4567")).toBe(normalizePhone("555-123-4567"));
    expect(normalizePhone("(555) 123-4567")).toBe("5551234567");
  });

  it("leaves an already-normalized number unchanged", () => {
    expect(normalizePhone("5551234567")).toBe("5551234567");
  });
});

describe("formatOrderNewMessage", () => {
  it("includes headcount when present", () => {
    expect(
      formatOrderNewMessage({ guestName: "Jane Doe", eventDate: "2026-08-01", headcount: 40 }),
    ).toBe("Jane Doe — 2026-08-01, 40 guests");
  });

  it("omits the guest count clause when headcount is null", () => {
    expect(
      formatOrderNewMessage({ guestName: "Jane Doe", eventDate: "2026-08-01", headcount: null }),
    ).toBe("Jane Doe — 2026-08-01");
  });
});

describe("formatStageChangeMessage", () => {
  it("renders the human-readable from/to stage labels", () => {
    expect(
      formatStageChangeMessage({
        guestName: "Jane Doe",
        eventDate: "2026-08-01",
        fromStage: "new",
        toStage: "confirm",
      }),
    ).toBe("Jane Doe — 2026-08-01: New → Confirmation Call");
  });

  it("labels a cancellation (CAT1)", () => {
    expect(
      formatStageChangeMessage({
        guestName: "Jane Doe",
        eventDate: "2026-08-01",
        fromStage: "confirm",
        toStage: "cancelled",
      }),
    ).toBe("Jane Doe — 2026-08-01: Confirmation Call → Cancelled");
  });
});

describe("revenue stage exclusion (CAT1/CAT4)", () => {
  it("counts confirmed/closed stages as revenue but not new or cancelled", () => {
    expect(countsAsRevenue("confirm")).toBe(true);
    expect(countsAsRevenue("setup")).toBe(true);
    expect(countsAsRevenue("out")).toBe(true);
    expect(countsAsRevenue("followup")).toBe(true);
    expect(countsAsRevenue("closed")).toBe(true);
    expect(countsAsRevenue("new")).toBe(false);
    expect(countsAsRevenue("cancelled")).toBe(false);
  });

  it("filterRevenueOrders drops new and cancelled orders", () => {
    const orders = [
      { id: "1", stage: "confirm" },
      { id: "2", stage: "new" },
      { id: "3", stage: "cancelled" },
      { id: "4", stage: "closed" },
    ];
    expect(filterRevenueOrders(orders).map((o) => o.id)).toEqual(["1", "4"]);
  });

  it("a cancelled order is excluded from revenue and lifetime spend (CAT1)", () => {
    // The exact rollups /catering/analytics + the order-detail guest-history
    // box run, but only over the revenue-countable orders.
    const orders = [
      { id: "1", contact_id: "c1", amount: 100, event_date: "2026-01-05", stage: "closed" },
      { id: "2", contact_id: "c1", amount: 500, event_date: "2026-01-12", stage: "cancelled" },
      { id: "3", contact_id: "c1", amount: 40, event_date: "2026-01-06", stage: "new" },
    ];

    const countable = filterRevenueOrders(orders);
    const analytics = computeAnalytics(countable, [{ id: "c1", name: "Alice" }]);
    expect(analytics.totalRevenue).toBe(100); // 500 cancelled + 40 new both excluded
    expect(analytics.totalOrders).toBe(1);

    const rollups = computeContactRollups(countable);
    expect(rollups.get("c1")).toMatchObject({ orderCount: 1, lifetimeSpend: 100 });
  });
});
