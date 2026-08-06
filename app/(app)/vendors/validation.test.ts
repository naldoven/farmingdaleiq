import { describe, expect, it } from "vitest";
import { vendorSchema } from "./validation";

describe("vendorSchema", () => {
  it("requires a name", () => {
    const result = vendorSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a minimal vendor", () => {
    const result = vendorSchema.safeParse({ name: "Ecolab" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Ecolab");
    }
  });

  it("rejects an invalid email", () => {
    const result = vendorSchema.safeParse({
      name: "Acme",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});
