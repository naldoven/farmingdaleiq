import { describe, expect, it } from "vitest";

import {
  computeAnalytics,
  buildPhysicalOrderSetup,
  canBuildCateringSetup,
  canCronMoveToSetup,
  cancelledOnLabel,
  cancelledOrderDetails,
  cateringStageAdvanceError,
  checklistRequiredBeforeStageAdvance,
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
  formatStageOverrideMessage,
  isCateringFollowUpDue,
  isCateringSetupDay,
  isCateringSetupDue,
  isCateringSetupWindow,
  isConfirmationCallDone,
  isConfirmationCallLate,
  isNewOrderSettling,
  isSetupBuildStage,
  isStageTouchedInSetupWindow,
  isoWeekKey,
  normalizePhone,
  parseComponents,
  parseOrderItemsFromNotes,
  parseRequestedCondiments,
  parseScalingRules,
  nextCateringStage,
  planMissingPreOrderChecklist,
  planPreOrderChecklist,
  periodRange,
  previousCateringStage,
  stageOverrideTargetError,
  planChecklistMaterialization,
  storeLocalDate,
  PACKING_LIST_BUILDING_ERROR,
  PACKING_LIST_NOT_BUILT_ERROR,
  SETUP_BUILD_SETTLE_MS,
  packingListGateError,
} from "@/app/(app)/catering/logic";

const PRE_ORDER_LABELS = planPreOrderChecklist().map((item) => item.label);

describe("catering stage handoffs", () => {
  it("allows only the immediate next stage", () => {
    expect(cateringStageAdvanceError("new", "confirm")).toBeNull();
    expect(cateringStageAdvanceError("confirm", "setup")).toBeNull();
    expect(cateringStageAdvanceError("setup", "out")).toBeNull();
    expect(cateringStageAdvanceError("out", "followup")).toBeNull();
    expect(cateringStageAdvanceError("followup", "closed")).toBeNull();
  });

  it("blocks skipped, reversed, and cancelled-stage moves", () => {
    expect(cateringStageAdvanceError("new", "out")).toBe("Move this order to Confirmation Call next.");
    expect(cateringStageAdvanceError("out", "setup")).toBe("Move this order to Follow-up next.");
    expect(cateringStageAdvanceError("cancelled", "confirm")).toBe(
      "Cancelled orders cannot return to the active pipeline.",
    );
  });

  it("gives closed orders a real message instead of naming a stage that does not exist", () => {
    const message = cateringStageAdvanceError("closed", "followup");
    expect(message).toBe("This order is closed and cannot move forward.");
    expect(message).not.toContain("undefined");
  });

  it("knows the one stage before and after each pipeline stage", () => {
    expect(nextCateringStage("new")).toBe("confirm");
    expect(nextCateringStage("followup")).toBe("closed");
    expect(nextCateringStage("closed")).toBeNull();
    expect(nextCateringStage("cancelled")).toBeNull();
    expect(previousCateringStage("confirm")).toBe("new");
    expect(previousCateringStage("closed")).toBe("followup");
    expect(previousCateringStage("new")).toBeNull();
    expect(previousCateringStage("cancelled")).toBeNull();
  });

  it("requires the right checklist at each operational handoff", () => {
    expect(checklistRequiredBeforeStageAdvance("new")).toBeNull();
    expect(checklistRequiredBeforeStageAdvance("confirm")).toBe("confirm");
    expect(checklistRequiredBeforeStageAdvance("setup")).toBe("setup");
    expect(checklistRequiredBeforeStageAdvance("out")).toBe("out");
    expect(checklistRequiredBeforeStageAdvance("followup")).toBeNull();
  });
});

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
  it("uses headcount for paper goods and twelve cups for each gallon drink", () => {
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
    });

    expect(result).toContainEqual({ section: "paper_goods", label: "Plates", qty: 25 });
    expect(result).toContainEqual({ section: "paper_goods", label: "Cups", qty: 25 });
    expect(result).toContainEqual({ section: "paper_goods", label: "Cutlery sets", qty: 25 });
    expect(result).toContainEqual({ section: "beverages", label: "Drink cups", qty: 24 });
    expect(result).toContainEqual({ section: "paper_goods", label: "Serving spoons", qty: 4 });
    expect(result).toContainEqual({ section: "paper_goods", label: "Tongs", qty: 4 });
    expect(result.some((item) => item.section === "sauces_dressings")).toBe(false);
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
      selectedCondiments: [{ name: "Creamy Salsa Dressing", qty: 10 }],
    });

    expect(result).toContainEqual({ section: "paper_goods", label: "Tongs", qty: 1 });
    expect(result).toContainEqual({ section: "sauces_dressings", label: "Creamy Salsa Dressing", qty: 10 });
    expect(result).toContainEqual({ section: "beverages", label: "Drink cups", qty: 12 });
  });

  it("uses only exact receipt-selected condiments and keeps food out of the setup", () => {
    const result = buildPhysicalOrderSetup({
      items: [
        { name: "Small Hot Chick-fil-A Nuggets Tray", qty: 1 },
        { name: "8 oz Chick-fil-A Sauce", qty: 2 },
        { name: "Chick-fil-A Sauce Flavored Waffle Potato Chips", qty: 1 },
        { name: "Large Kale Crunch Side Tray", qty: 1 },
      ],
      selectedCondiments: [{ name: "8 oz Chick-fil-A Sauce", qty: 2 }],
      headcount: 20,
      paperGoods: true,
      fulfillment: "pickup",
    });

    expect(result).toContainEqual({ section: "sauces_dressings", label: "8 oz Chick-fil-A Sauce", qty: 2 });
    expect(result.some((item) => item.label.includes("8-count sauce packets"))).toBe(false);
    expect(result.some((item) => item.label === "Roasted almonds")).toBe(false);
  });

  it("accepts only known condiment receipt lines from stored selections", () => {
    expect(
      parseRequestedCondiments([
        { name: "8oz Garden Herb Ranch Sauce", qty: 1 },
        { name: "Avocado Lime Ranch Dressing", qty: 2 },
        { name: "Large Mac & Cheese Tray", qty: 1 },
      ]),
    ).toEqual([
      { name: "8oz Garden Herb Ranch Sauce", qty: 1 },
      { name: "Avocado Lime Ranch Dressing", qty: 2 },
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

describe("planPreOrderChecklist", () => {
  it("places the final handoff checks under Pickup/Delivery", () => {
    expect(planPreOrderChecklist()).toEqual([
      { stage: "out", label: "Compare packed items to the receipt", sort: 900 },
      { stage: "out", label: "Verify sauces and special instructions", sort: 901 },
      { stage: "out", label: "Cold items packed last", sort: 902 },
    ]);
  });
});

describe("planMissingPreOrderChecklist", () => {
  it("adds all three Pre-order items to an order that has none", () => {
    expect(planMissingPreOrderChecklist([])).toEqual(planPreOrderChecklist());
  });

  it("skips Pre-order items the order already has, so a rebuild cannot duplicate them", () => {
    expect(
      planMissingPreOrderChecklist(["Compare packed items to the receipt", " cold items packed last ", "Tender out"]),
    ).toEqual([{ stage: "out", label: "Verify sauces and special instructions", sort: 901 }]);
    expect(planMissingPreOrderChecklist([...PRE_ORDER_LABELS])).toEqual([]);
  });
});

describe("stageOverrideTargetError", () => {
  const order = { event_date: "2026-08-20", event_time: "14:00:00" };

  it("refuses landing on Pickup/Delivery after the event time, where the cron would undo it", () => {
    expect(stageOverrideTargetError(order, "out", new Date("2026-08-20T18:30:00.000Z"))).toBe(
      "The event time has passed, so this order would go straight back to Follow-up.",
    );
  });

  it("allows Pickup/Delivery before the event time, without a time, and every other stage", () => {
    expect(stageOverrideTargetError(order, "out", new Date("2026-08-20T17:00:00.000Z"))).toBeNull();
    expect(
      stageOverrideTargetError({ ...order, event_time: null }, "out", new Date("2026-08-21T12:00:00.000Z")),
    ).toBeNull();
    expect(stageOverrideTargetError(order, "followup", new Date("2026-08-21T12:00:00.000Z"))).toBeNull();
  });
});

describe("formatStageOverrideMessage", () => {
  it("names the override and carries the manager's reason", () => {
    const base = { guestName: "Jane", eventDate: "2026-08-21", fromStage: "setup" as const, toStage: "confirm" as const };
    expect(formatStageOverrideMessage({ ...base, kind: "move_back", reason: "Guest changed the menu" })).toBe(
      `${formatStageChangeMessage(base)}. Moved back by a manager: Guest changed the menu`,
    );
    expect(
      formatStageOverrideMessage({ ...base, fromStage: "cancelled", kind: "restore", reason: "Cancelled by mistake" }),
    ).toContain("Restored by a manager: Cancelled by mistake");
  });

  it("never lets a guest name or reason ping the Discord server", () => {
    const message = formatStageOverrideMessage({
      guestName: "@everyone",
      eventDate: "2026-08-21",
      fromStage: "setup",
      toStage: "confirm",
      kind: "move_back",
      reason: "ask @here and <@123>",
    });
    expect(message).not.toMatch(/@everyone|@here|<@\d/);
    expect(formatOrderNewMessage({ guestName: "@here", eventDate: "2026-08-21", headcount: 5 })).not.toMatch(
      /@here/,
    );
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

describe("isCateringSetupDue", () => {
  const order = {
    stage: "new",
    event_date: "2026-08-21",
    setup_generated_at: null,
  };

  it("becomes due on the New York calendar day before the event", () => {
    expect(isCateringSetupDay(order.event_date, new Date("2026-08-20T04:01:00.000Z"))).toBe(true);
    expect(isCateringSetupDue(order, new Date("2026-08-20T04:01:00.000Z"))).toBe(true);
    expect(isCateringSetupDue(order, new Date("2026-08-19T23:59:59.000Z"))).toBe(false);
  });

  it("is also due on the event day itself, for same-day orders or a list wiped by an edit", () => {
    // 2026-08-21 13:00 New York.
    const eventDay = new Date("2026-08-21T17:00:00.000Z");
    expect(isCateringSetupWindow("2026-08-21", eventDay)).toBe(true);
    expect(isCateringSetupDue(order, eventDay)).toBe(true);
    // The day after the event is too late for the automatic build.
    expect(isCateringSetupDue(order, new Date("2026-08-22T17:00:00.000Z"))).toBe(false);
  });

  it("does not rebuild a generated, cancelled, or closed setup", () => {
    expect(isCateringSetupDue({ ...order, setup_generated_at: "2026-08-20T12:00:00.000Z" })).toBe(false);
    expect(isCateringSetupDue({ ...order, stage: "cancelled" })).toBe(false);
    expect(isCateringSetupDue({ ...order, stage: "closed" })).toBe(false);
  });
});

describe("canBuildCateringSetup", () => {
  // 2026-08-20 13:00 New York.
  const now = new Date("2026-08-20T17:00:00.000Z");

  it("allows a manual build from the day before the event onward", () => {
    expect(canBuildCateringSetup("2026-08-21", now)).toBe(true);
    expect(canBuildCateringSetup("2026-08-20", now)).toBe(true);
    expect(canBuildCateringSetup("2026-08-10", now)).toBe(true);
  });

  it("refuses a build two or more days early, before the receipt is final", () => {
    expect(canBuildCateringSetup("2026-08-22", now)).toBe(false);
  });

  it("uses the New York date, not UTC, late in the evening", () => {
    // 2026-08-20 22:30 New York is already 2026-08-21 in UTC.
    expect(canBuildCateringSetup("2026-08-22", new Date("2026-08-21T02:30:00.000Z"))).toBe(false);
  });
});

describe("isConfirmationCallLate", () => {
  // 2026-08-20 13:00 New York.
  const now = new Date("2026-08-20T17:00:00.000Z");
  const undone = [{ done: true }, { done: false }];
  const ticked = [{ done: true }, { done: true }];

  it("flags an open call when the event is tomorrow, today, or already past", () => {
    expect(isConfirmationCallLate({ stage: "new", event_date: "2026-08-21" }, undone, now)).toBe(true);
    expect(isConfirmationCallLate({ stage: "confirm", event_date: "2026-08-20" }, undone, now)).toBe(true);
    expect(isConfirmationCallLate({ stage: "confirm", event_date: "2026-08-18" }, undone, now)).toBe(true);
  });

  it("treats an order with no call items as a call not done", () => {
    expect(isConfirmationCallLate({ stage: "confirm", event_date: "2026-08-21" }, [], now)).toBe(true);
  });

  it("does not flag a ticked call", () => {
    expect(isConfirmationCallLate({ stage: "confirm", event_date: "2026-08-21" }, ticked, now)).toBe(false);
  });

  it("does not flag orders further out or past Confirmation Call", () => {
    expect(isConfirmationCallLate({ stage: "confirm", event_date: "2026-08-22" }, undone, now)).toBe(false);
    expect(isConfirmationCallLate({ stage: "setup", event_date: "2026-08-21" }, undone, now)).toBe(false);
    expect(isConfirmationCallLate({ stage: "cancelled", event_date: "2026-08-21" }, undone, now)).toBe(false);
  });
});

describe("cron move to FOH Setup", () => {
  const order = { stage: "confirm", event_date: "2026-08-21", stage_changed_at: "2026-08-10T15:00:00.000Z" };
  const ticked = [{ done: true }, { done: true }];

  it("counts the call as done only when call items exist and all are ticked", () => {
    expect(isConfirmationCallDone(ticked)).toBe(true);
    expect(isConfirmationCallDone([])).toBe(false);
    expect(isConfirmationCallDone([{ done: true }, { done: false }])).toBe(false);
  });

  it("moves a confirmed order nobody has moved since the build window opened", () => {
    expect(canCronMoveToSetup(order, ticked)).toBe(true);
    expect(canCronMoveToSetup({ ...order, stage: "new", stage_changed_at: null }, ticked)).toBe(true);
  });

  it("does not move an order with zero call items", () => {
    expect(canCronMoveToSetup(order, [])).toBe(false);
  });

  it("does not move an order a person moved on or after midnight of the day before", () => {
    // Window opens 2026-08-20 00:00 New York, which is 04:00 UTC in summer.
    expect(isStageTouchedInSetupWindow({ ...order, stage_changed_at: "2026-08-20T03:59:59.000Z" })).toBe(false);
    expect(isStageTouchedInSetupWindow({ ...order, stage_changed_at: "2026-08-20T04:00:00.000Z" })).toBe(true);
    expect(canCronMoveToSetup({ ...order, stage_changed_at: "2026-08-20T15:00:00.000Z" }, ticked)).toBe(false);
  });

  it("never moves an order already past Confirmation Call", () => {
    expect(canCronMoveToSetup({ ...order, stage: "setup" }, ticked)).toBe(false);
  });
});

describe("isNewOrderSettling", () => {
  const now = new Date("2026-08-20T17:00:00.000Z");

  it("holds orders younger than two minutes and releases them after", () => {
    expect(isNewOrderSettling("2026-08-20T16:58:30.000Z", now)).toBe(true);
    expect(isNewOrderSettling("2026-08-20T16:58:00.000Z", now)).toBe(false);
    expect(isNewOrderSettling("not a date", now)).toBe(false);
  });
});

describe("packingListGateError", () => {
  const now = new Date("2026-08-20T17:00:00.000Z");

  it("refuses when no list was built", () => {
    expect(packingListGateError(null, now)).toBe(PACKING_LIST_NOT_BUILT_ERROR);
  });

  it("refuses while a fresh stamp may still sit beside an empty, inserting list", () => {
    // 16:59:30Z is 12:59 PM in New York (EDT); the move opens two minutes later.
    expect(packingListGateError("2026-08-20T16:59:30.000Z", now)).toBe(
      "The packing list was rebuilt at 12:59 PM. You can move this order on at 1:01 PM.",
    );
    expect(packingListGateError("2026-08-20T16:58:00.001Z", now)).toContain("You can move this order on at 1:00 PM.");
    expect(packingListGateError("not a date", now)).toBe(PACKING_LIST_BUILDING_ERROR);
  });

  it("passes once the stamp is older than any build takes", () => {
    expect(packingListGateError(new Date(now.getTime() - SETUP_BUILD_SETTLE_MS).toISOString(), now)).toBeNull();
    expect(packingListGateError("2026-08-19T04:00:00.000Z", now)).toBeNull();
  });
});

describe("isSetupBuildStage", () => {
  it("allows New through Pickup/Delivery only", () => {
    for (const stage of ["new", "confirm", "setup", "out"]) expect(isSetupBuildStage(stage)).toBe(true);
    for (const stage of ["followup", "closed", "cancelled", "archived"]) expect(isSetupBuildStage(stage)).toBe(false);
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

  it("includes stage defaults and kitchen prep items while the day-before setup is pending", () => {
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

describe("cancelled orders list", () => {
  it("cancelledOrderDetails joins the event date, fulfillment and headcount", () => {
    expect(
      cancelledOrderDetails({ event_date: "2026-11-03", fulfillment: "delivery", headcount: 40 }),
    ).toBe("Event Nov 3, 2026 · Delivery · 40 guests");
    expect(
      cancelledOrderDetails({ event_date: "2026-11-03", fulfillment: "pickup", headcount: 1 }),
    ).toBe("Event Nov 3, 2026 · Pickup · 1 guest");
  });

  it("cancelledOrderDetails leaves out parts the order does not have", () => {
    expect(cancelledOrderDetails({ event_date: "2026-11-03", fulfillment: null, headcount: null })).toBe(
      "Event Nov 3, 2026",
    );
    // A zero headcount is a real value, not a missing one.
    expect(cancelledOrderDetails({ event_date: "2026-11-03", fulfillment: null, headcount: 0 })).toBe(
      "Event Nov 3, 2026 · 0 guests",
    );
  });

  it("cancelledOnLabel shows the cancel time in store time", () => {
    // 19:15 UTC on Oct 25 is 3:15 PM Eastern (daylight time until Nov 1).
    expect(cancelledOnLabel("2026-10-25T19:15:00.000Z")).toBe("Cancelled Oct 25, 2026, 3:15 PM");
  });

  it("cancelledOnLabel says so when the cancel time was never stamped", () => {
    expect(cancelledOnLabel(null)).toBe("Cancel time not recorded");
    expect(cancelledOnLabel("not a date")).toBe("Cancel time not recorded");
  });
});
