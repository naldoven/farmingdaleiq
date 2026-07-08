import { describe, expect, it } from "vitest";

import {
  addChecklistItemSchema,
  changeStageSchema,
  checklistDefaultSchema,
  createOrderSchema,
  menuItemSchema,
  resolveFollowUpSchema,
  toggleChecklistDefaultActiveSchema,
  updateChecklistDefaultSchema,
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

  it("rejects JSON that isn't an array", () => {
    const result = menuItemSchema.safeParse({
      name: "Boxed Meal",
      componentsText: '{"name":"Sandwich"}',
    });
    expect(result.success).toBe(false);
  });
});
