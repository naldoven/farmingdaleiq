import { describe, expect, it } from "vitest";

import {
  addChecklistItemSchema,
  bulkCloseStaleOrdersSchema,
  changeStageSchema,
  checklistDefaultSchema,
  createOrderSchema,
  menuItemSchema,
  moveOrderBackSchema,
  orderSearchSchema,
  reorderChecklistDefaultsSchema,
  resolveFollowUpSchema,
  restoreOrderSchema,
  toggleChecklistDefaultActiveSchema,
  updateChecklistDefaultSchema,
  updateMenuItemSchema,
  updateOrderDetailsSchema,
  updateOrderItemQtySchema,
} from "@/app/(app)/catering/validation";

describe("createOrderSchema", () => {
  it("accepts a minimal valid order", () => {
    const result = createOrderSchema.safeParse({
      guestName: "Jane Doe",
      eventDate: "2026-08-01",
      paperGoods: false,
      items: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a blank guest name", () => {
    const result = createOrderSchema.safeParse({
      guestName: "   ",
      eventDate: "2026-08-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email but allows an empty one", () => {
    expect(
      createOrderSchema.safeParse({
        guestName: "Jane",
        eventDate: "2026-08-01",
        email: "not-an-email",
      }).success,
    ).toBe(false);
    expect(
      createOrderSchema.safeParse({
        guestName: "Jane",
        eventDate: "2026-08-01",
        email: "",
      }).success,
    ).toBe(true);
  });

  it("validates nested order items", () => {
    const result = createOrderSchema.safeParse({
      guestName: "Jane",
      eventDate: "2026-08-01",
      items: [{ menuItemId: "not-a-uuid", qty: 1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a delivery order with no delivery address", () => {
    const result = createOrderSchema.safeParse({
      guestName: "Jane",
      eventDate: "2026-08-01",
      fulfillment: "delivery",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["deliveryAddress"]);
    }
  });

  it("accepts a delivery order that includes a delivery address", () => {
    const result = createOrderSchema.safeParse({
      guestName: "Jane",
      eventDate: "2026-08-01",
      fulfillment: "delivery",
      deliveryAddress: "123 Main St",
    });
    expect(result.success).toBe(true);
  });

  it("does not require a delivery address for pickup orders", () => {
    const result = createOrderSchema.safeParse({
      guestName: "Jane",
      eventDate: "2026-08-01",
      fulfillment: "pickup",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateOrderDetailsSchema", () => {
  it("rejects a delivery order with no delivery address", () => {
    const result = updateOrderDetailsSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      guestName: "Jane",
      eventDate: "2026-08-01",
      fulfillment: "delivery",
    });
    expect(result.success).toBe(false);
  });
});

describe("changeStageSchema", () => {
  it("accepts any known stage", () => {
    expect(
      changeStageSchema.safeParse({ orderId: "11111111-1111-4111-8111-111111111111", toStage: "closed" })
        .success,
    ).toBe(true);
  });

  it("rejects an unknown stage", () => {
    expect(
      changeStageSchema.safeParse({
        orderId: "11111111-1111-4111-8111-111111111111",
        toStage: "archived",
      }).success,
    ).toBe(false);
  });
});

describe("manager override schemas", () => {
  const orderId = "11111111-1111-4111-8111-111111111111";

  it("moveOrderBackSchema needs a real reason and trims it", () => {
    const ok = moveOrderBackSchema.safeParse({ orderId, fromStage: "setup", reason: "  Guest changed the menu  " });
    expect(ok.success && ok.data.reason).toBe("Guest changed the menu");
    expect(moveOrderBackSchema.safeParse({ orderId, fromStage: "setup", reason: "   " }).success).toBe(false);
    expect(moveOrderBackSchema.safeParse({ orderId, fromStage: "setup", reason: "ok" }).success).toBe(false);
    expect(moveOrderBackSchema.safeParse({ orderId, fromStage: "setup", reason: "x".repeat(301) }).success).toBe(false);
  });

  it("moveOrderBackSchema only takes pipeline stages", () => {
    expect(moveOrderBackSchema.safeParse({ orderId, fromStage: "cancelled", reason: "Wrong order" }).success).toBe(false);
  });

  it("restoreOrderSchema accepts New through Follow-up only", () => {
    for (const toStage of ["new", "confirm", "setup", "out", "followup"]) {
      expect(restoreOrderSchema.safeParse({ orderId, toStage, reason: "Cancelled by mistake" }).success).toBe(true);
    }
    for (const toStage of ["closed", "cancelled", ""]) {
      const result = restoreOrderSchema.safeParse({ orderId, toStage, reason: "Cancelled by mistake" });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("Pick a stage to restore to.");
    }
  });
});

describe("addChecklistItemSchema", () => {
  it("rejects a checklist stage outside the four known stages", () => {
    expect(
      addChecklistItemSchema.safeParse({
        orderId: "11111111-1111-4111-8111-111111111111",
        stage: "closed",
        label: "Test",
      }).success,
    ).toBe(false);
  });
});

describe("updateOrderItemQtySchema", () => {
  it("rejects a zero or negative qty", () => {
    expect(
      updateOrderItemQtySchema.safeParse({ id: "11111111-1111-4111-8111-111111111111", qty: 0 })
        .success,
    ).toBe(false);
  });
});

describe("resolveFollowUpSchema", () => {
  it("allows an empty outcome/note", () => {
    expect(
      resolveFollowUpSchema.safeParse({ id: "11111111-1111-4111-8111-111111111111" }).success,
    ).toBe(true);
  });
});

describe("checklistDefaultSchema", () => {
  it("accepts a known checklist stage and non-empty label", () => {
    expect(checklistDefaultSchema.safeParse({ stage: "setup", label: "Serving utensils out" }).success).toBe(
      true,
    );
  });

  it("rejects an order-pipeline stage (not a checklist stage)", () => {
    expect(checklistDefaultSchema.safeParse({ stage: "closed", label: "x" }).success).toBe(false);
  });

  it("rejects a blank label", () => {
    expect(checklistDefaultSchema.safeParse({ stage: "setup", label: "  " }).success).toBe(false);
  });
});

describe("updateChecklistDefaultSchema", () => {
  it("requires id and active alongside stage/label", () => {
    const result = updateChecklistDefaultSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      stage: "out",
      label: "Bags loaded",
      active: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("toggleChecklistDefaultActiveSchema", () => {
  it("accepts an id and boolean active flag", () => {
    expect(
      toggleChecklistDefaultActiveSchema.safeParse({
        id: "11111111-1111-4111-8111-111111111111",
        active: true,
      }).success,
    ).toBe(true);
  });
});

describe("menuItemSchema", () => {
  it("accepts empty components/scaling_rules text as empty arrays", () => {
    const result = menuItemSchema.safeParse({ name: "8-Count Tray" });
    expect(result.success).toBe(true);
  });

  it("accepts valid JSON array text", () => {
    const result = menuItemSchema.safeParse({
      name: "Boxed Meal",
      pickupPriceText: "43.50",
      deliveryPriceText: "56.50",
      componentsText: '[{"name":"Sandwich","qty":1}]',
      scalingRulesText: '[{"label":"Napkins","perQty":1}]',
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed JSON", () => {
    const result = menuItemSchema.safeParse({
      name: "Boxed Meal",
      componentsText: "{not valid json",
    });
    expect(result.success).toBe(false);
  });

  it("rejects prices with more than two decimal places", () => {
    const result = menuItemSchema.safeParse({ name: "Boxed Meal", pickupPriceText: "43.505" });
    expect(result.success).toBe(false);
  });

  it("rejects JSON that isn't an array", () => {
    const result = menuItemSchema.safeParse({
      name: "Boxed Meal",
      componentsText: '{"name":"Sandwich"}',
    });
    expect(result.success).toBe(false);
  });
});

describe("menuItemSchema rows (server-side validation)", () => {
  const parse = (fields: { componentsText?: string; scalingRulesText?: string }) =>
    menuItemSchema.safeParse({ name: "Boxed Meal", ...fields });

  /** The plain sentences a bad row produces, joined the way toActionError joins them. */
  const errorText = (fields: { componentsText?: string; scalingRulesText?: string }): string => {
    const result = parse(fields);
    if (result.success) return "";
    return result.error.issues.map((issue) => issue.message).join("; ");
  };

  describe("components", () => {
    it("accepts the seeded shape and returns it unchanged", () => {
      const seeded = '[{"name":"Chicken Sandwich","qty":1},{"name":"Chips","qty":1},{"name":"Cookie","qty":1}]';
      const result = parse({ componentsText: seeded });
      expect(result.success).toBe(true);
      if (result.success) expect(JSON.parse(result.data.componentsText)).toEqual(JSON.parse(seeded));
    });

    it("trims names, keeps a fractional quantity, and keeps the saved key order", () => {
      const result = parse({ componentsText: '[{"qty":2.5,"name":"  Sandwich  "}]' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.componentsText).toBe('[{"name":"Sandwich","qty":2.5}]');
    });

    it("treats a missing quantity as the documented default of 1", () => {
      const result = parse({ componentsText: '[{"name":"Chips"}]' });
      expect(result.success).toBe(true);
      if (result.success) expect(JSON.parse(result.data.componentsText)).toEqual([{ name: "Chips", qty: 1 }]);
    });

    it("refuses a blank name", () => {
      expect(errorText({ componentsText: '[{"name":"   ","qty":1}]' })).toBe("Component 1: name is required.");
      expect(errorText({ componentsText: '[{"qty":1}]' })).toBe("Component 1: name is required.");
    });

    it.each([
      ["zero", '{"name":"Chips","qty":0}', "Component 1: quantity must be at least 1."],
      ["below 1", '{"name":"Chips","qty":0.5}', "Component 1: quantity must be at least 1."],
      ["negative", '{"name":"Chips","qty":-3}', "Component 1: quantity must be at least 1."],
      ["a string", '{"name":"Chips","qty":"2"}', "Component 1: quantity must be a number."],
      ["null", '{"name":"Chips","qty":null}', "Component 1: quantity must be a number."],
      ["infinite", '{"name":"Chips","qty":1e999}', "Component 1: quantity must be a number."],
    ])("refuses a quantity that is %s instead of changing it to 1", (_label, row, message) => {
      expect(errorText({ componentsText: `[${row}]` })).toBe(message);
    });

    it("refuses rows that are not objects, and fields it does not know", () => {
      expect(errorText({ componentsText: '["Sandwich"]' })).toBe(
        "Component 1: each component needs a name and a quantity.",
      );
      expect(errorText({ componentsText: "[null]" })).toContain("Component 1:");
      expect(errorText({ componentsText: '[{"name":"Chips","qty":1,"note":"x"}]' })).toBe(
        "Component 1: has a field this form does not use.",
      );
    });

    it("names the row that is wrong", () => {
      expect(
        errorText({ componentsText: '[{"name":"Chips","qty":1},{"name":"Cookie","qty":0}]' }),
      ).toBe("Component 2: quantity must be at least 1.");
    });

    it("refuses text that is not a list, or not JSON, or too long", () => {
      expect(errorText({ componentsText: '{"name":"Chips"}' })).toBe("Components must be a list.");
      expect(errorText({ componentsText: "{nope" })).toBe("Components must be a valid list.");
      const tooMany = JSON.stringify(Array.from({ length: 51 }, (_, i) => ({ name: `C${i}`, qty: 1 })));
      expect(errorText({ componentsText: tooMany })).toBe("Components: 50 rows at most.");
    });

    it("accepts empty or missing text as no components", () => {
      for (const componentsText of [undefined, "", "   ", "[]"]) {
        const result = parse({ componentsText });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.componentsText).toBe("[]");
      }
    });
  });

  describe("scaling rules", () => {
    it("accepts the seeded shape and returns it unchanged", () => {
      const seeded =
        '[{"label":"Napkins","perHeadcount":0,"perQty":1},{"label":"Sauce packets","perHeadcount":0,"perQty":2}]';
      const result = parse({ scalingRulesText: seeded });
      expect(result.success).toBe(true);
      if (result.success) expect(JSON.parse(result.data.scalingRulesText)).toEqual(JSON.parse(seeded));
    });

    it("fills a missing axis with the documented 0 and trims the label", () => {
      const result = parse({ scalingRulesText: '[{"label":" Napkins ","perQty":1}]' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.scalingRulesText).toBe('[{"label":"Napkins","perHeadcount":0,"perQty":1}]');
      }
    });

    it("accepts fractional amounts", () => {
      expect(parse({ scalingRulesText: '[{"label":"Cups","perHeadcount":0.5,"perQty":0}]' }).success).toBe(true);
    });

    it("refuses a blank supply name", () => {
      expect(errorText({ scalingRulesText: '[{"label":" ","perQty":1}]' })).toBe(
        "Scaling rule 1: supply name is required.",
      );
    });

    it.each([
      ["negative per guest", '{"label":"Cups","perHeadcount":-2,"perQty":1}', "Scaling rule 1: per guest amount can't be negative."],
      ["negative per item", '{"label":"Cups","perHeadcount":1,"perQty":-1}', "Scaling rule 1: per item amount can't be negative."],
      ["text per guest", '{"label":"Cups","perHeadcount":"2","perQty":1}', "Scaling rule 1: per guest amount must be a number."],
      ["infinite per item", '{"label":"Cups","perHeadcount":1,"perQty":1e999}', "Scaling rule 1: per item amount must be a number."],
      ["above the cap", '{"label":"Cups","perHeadcount":10001,"perQty":0}', "Scaling rule 1: per guest amount can't be more than 10000."],
    ])("refuses %s instead of changing it to 0", (_label, row, message) => {
      expect(errorText({ scalingRulesText: `[${row}]` })).toBe(message);
    });

    it("refuses a rule with no amount on either axis, as the form does", () => {
      expect(errorText({ scalingRulesText: '[{"label":"Cups","perHeadcount":0,"perQty":0}]' })).toBe(
        "Scaling rule 1: needs a per guest or per item amount above 0.",
      );
      expect(errorText({ scalingRulesText: '[{"label":"Cups"}]' })).toBe(
        "Scaling rule 1: needs a per guest or per item amount above 0.",
      );
    });

    it("refuses unknown fields and rows that are not objects", () => {
      expect(errorText({ scalingRulesText: '[{"label":"Cups","perQty":1,"each":2}]' })).toBe(
        "Scaling rule 1: has a field this form does not use.",
      );
      expect(errorText({ scalingRulesText: '["Cups"]' })).toBe(
        "Scaling rule 1: each scaling rule needs a supply name and an amount.",
      );
    });

    it("reports at most three bad rows", () => {
      const bad = Array.from({ length: 5 }, () => ({ label: "", perQty: 1 }));
      const message = errorText({ scalingRulesText: JSON.stringify(bad) });
      expect(message.split("; ")).toHaveLength(3);
    });

    it("accepts empty or missing text as no rules", () => {
      for (const scalingRulesText of [undefined, "", "[]"]) {
        const result = parse({ scalingRulesText });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.scalingRulesText).toBe("[]");
      }
    });
  });

  it("applies the same checks when updating an item", () => {
    const base = { id: "11111111-1111-4111-8111-111111111111", name: "Boxed Meal" };
    expect(updateMenuItemSchema.safeParse({ ...base, componentsText: '[{"name":"Chips","qty":0}]' }).success).toBe(false);
    expect(updateMenuItemSchema.safeParse({ ...base, componentsText: '[{"name":"Chips","qty":2}]' }).success).toBe(true);
  });
});

describe("bulkCloseStaleOrdersSchema", () => {
  const id = "33333333-3333-4333-8333-333333333333";

  it("accepts a batch with a reason", () => {
    expect(bulkCloseStaleOrdersSchema.safeParse({ orderIds: [id], reason: "Event passed" }).success).toBe(true);
  });

  it("rejects an empty batch", () => {
    const result = bulkCloseStaleOrdersSchema.safeParse({ orderIds: [], reason: "Event passed" });
    expect(result.success).toBe(false);
  });

  it("caps a batch at 200 orders", () => {
    const result = bulkCloseStaleOrdersSchema.safeParse({ orderIds: Array(201).fill(id), reason: "Event passed" });
    expect(result.success).toBe(false);
  });

  it("accepts a full screen of exactly 200, which is all the stale page loads", () => {
    const result = bulkCloseStaleOrdersSchema.safeParse({ orderIds: Array(200).fill(id), reason: "Event passed" });
    expect(result.success).toBe(true);
  });

  it("needs the same short reason as the other manager overrides", () => {
    expect(bulkCloseStaleOrdersSchema.safeParse({ orderIds: [id], reason: " x " }).success).toBe(false);
    expect(bulkCloseStaleOrdersSchema.safeParse({ orderIds: [id], reason: "a".repeat(301) }).success).toBe(false);
  });

  it("rejects ids that are not uuids", () => {
    expect(bulkCloseStaleOrdersSchema.safeParse({ orderIds: ["not-an-id"], reason: "Event passed" }).success).toBe(false);
  });
});

describe("orderSearchSchema", () => {
  it("trims the query", () => {
    expect(orderSearchSchema.parse({ query: "  Jane  " })).toEqual({ query: "Jane" });
  });

  it("allows an empty query (the action returns no results)", () => {
    expect(orderSearchSchema.safeParse({ query: "   " }).success).toBe(true);
  });

  it("rejects a query over 80 characters", () => {
    expect(orderSearchSchema.safeParse({ query: "a".repeat(81) }).success).toBe(false);
  });
});

describe("reorderChecklistDefaultsSchema", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("accepts a stage with a list of ids", () => {
    expect(reorderChecklistDefaultsSchema.safeParse({ stage: "setup", orderedIds: [id] }).success).toBe(true);
  });

  it("rejects a bad stage", () => {
    expect(reorderChecklistDefaultsSchema.safeParse({ stage: "nope", orderedIds: [id] }).success).toBe(false);
  });

  it("rejects an empty list", () => {
    expect(reorderChecklistDefaultsSchema.safeParse({ stage: "setup", orderedIds: [] }).success).toBe(false);
  });
});
