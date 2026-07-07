import { describe, expect, it } from "vitest";
import { vendorSchema } from "./validation";

describe("vendorSchema", () => {
  it("requires a name", () => {
    const result = vendorSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a minimal vendor with defaulted delivery days", () => {
    const result = vendorSchema.safeParse({ name: "Ecolab" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deliveryDays).toEqual([]);
    }
  });

  it("rejects an invalid email", () => {
    const result = vendorSchema.safeParse({ name: "Acme", email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a delivery day outside the allowed set", () => {
    const result = vendorSchema.safeParse({ name: "Acme", deliveryDays: ["Someday"] });
    expect(result.success).toBe(false);
  });

  it("accepts valid delivery days", () => {
    const result = vendorSchema.safeParse({ name: "Acme", deliveryDays: ["Mon", "Wed", "Fri"] });
    expect(result.success).toBe(true);
  });
});
