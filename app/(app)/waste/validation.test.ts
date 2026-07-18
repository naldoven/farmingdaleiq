import { describe, expect, it } from "vitest";

import {
  createCategorySchema,
  createItemSchema,
  idSchema,
  logEntrySchema,
  updateCategorySchema,
  updateItemSchema,
} from "@/app/(app)/waste/validation";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("logEntrySchema", () => {
  it("accepts a minimal valid entry", () => {
    const result = logEntrySchema.parse({ itemId: UUID_A, quantity: 2 });
    expect(result.itemId).toBe(UUID_A);
    expect(result.quantity).toBe(2);
  });

  it("accepts an optional day part and note", () => {
    const result = logEntrySchema.parse({
      itemId: UUID_A,
      quantity: 1.5,
      dayPartId: UUID_B,
      note: "Dropped tray",
    });
    expect(result.dayPartId).toBe(UUID_B);
    expect(result.note).toBe("Dropped tray");
  });

  it("rejects zero quantity", () => {
    expect(() => logEntrySchema.parse({ itemId: UUID_A, quantity: 0 })).toThrow();
  });

  it("rejects negative quantity", () => {
    expect(() => logEntrySchema.parse({ itemId: UUID_A, quantity: -3 })).toThrow();
  });

  it("rejects a non-uuid item id", () => {
    expect(() => logEntrySchema.parse({ itemId: "not-a-uuid", quantity: 1 })).toThrow();
  });

  it("coerces a numeric string quantity (form inputs arrive as strings)", () => {
    const result = logEntrySchema.parse({ itemId: UUID_A, quantity: "4" });
    expect(result.quantity).toBe(4);
  });

  it("accepts a quantity exactly at the max", () => {
    const result = logEntrySchema.parse({ itemId: UUID_A, quantity: 10000 });
    expect(result.quantity).toBe(10000);
  });

  it("rejects a quantity just over the max", () => {
    expect(() => logEntrySchema.parse({ itemId: UUID_A, quantity: 10001 })).toThrow();
  });

  it("rejects an absurd typo quantity (1e21 that renders as $5.84e+21)", () => {
    expect(() => logEntrySchema.parse({ itemId: UUID_A, quantity: 1e21 })).toThrow();
  });
});

describe("idSchema", () => {
  it("accepts a valid uuid", () => {
    expect(idSchema.parse({ id: UUID_A })).toEqual({ id: UUID_A });
  });

  it("rejects a non-uuid", () => {
    expect(() => idSchema.parse({ id: "nope" })).toThrow();
  });
});

describe("createCategorySchema / updateCategorySchema", () => {
  it("requires a non-empty name", () => {
    expect(() => createCategorySchema.parse({ name: "" })).toThrow();
  });

  it("defaults sort to 0 when omitted", () => {
    const result = createCategorySchema.parse({ name: "Produce" });
    expect(result.sort).toBe(0);
  });

  it("update schema requires an id in addition to the create fields", () => {
    const result = updateCategorySchema.parse({ id: UUID_A, name: "Produce", sort: 3 });
    expect(result.id).toBe(UUID_A);
    expect(result.sort).toBe(3);
  });
});

describe("createItemSchema / updateItemSchema", () => {
  it("requires a valid unit", () => {
    expect(() =>
      createItemSchema.parse({ name: "Fries", unit: "gallon" }),
    ).toThrow();
  });

  it("accepts each of the allowed units", () => {
    for (const unit of ["each", "lb", "oz"] as const) {
      const result = createItemSchema.parse({ name: "Item", unit });
      expect(result.unit).toBe(unit);
    }
  });

  it("allows a null category id and a null unit cost", () => {
    const result = createItemSchema.parse({
      name: "Fries",
      unit: "lb",
      categoryId: null,
      unitCost: null,
    });
    expect(result.categoryId).toBeNull();
    expect(result.unitCost).toBeNull();
  });

  it("rejects a negative unit cost", () => {
    expect(() =>
      createItemSchema.parse({ name: "Fries", unit: "lb", unitCost: -1 }),
    ).toThrow();
  });

  it("update schema requires an id in addition to the create fields", () => {
    const result = updateItemSchema.parse({
      id: UUID_A,
      name: "Fries",
      unit: "lb",
      categoryId: UUID_B,
      unitCost: 2.5,
    });
    expect(result.id).toBe(UUID_A);
    expect(result.categoryId).toBe(UUID_B);
    expect(result.unitCost).toBe(2.5);
  });
});
