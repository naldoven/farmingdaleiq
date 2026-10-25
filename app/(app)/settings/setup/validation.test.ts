import { describe, expect, it } from "vitest";

import { setupAreaKeySchema } from "./validation";

describe("setupAreaKeySchema", () => {
  it("accepts a registry key", () => {
    expect(setupAreaKeySchema.safeParse({ areaKey: "waste_items" }).success).toBe(true);
  });

  it("rejects a key that is not in the registry", () => {
    // The action upserts the key as a primary key, so an unknown or
    // misspelled key would create a row the Store setup page can never show.
    expect(setupAreaKeySchema.safeParse({ areaKey: "waste" }).success).toBe(false);
    expect(setupAreaKeySchema.safeParse({ areaKey: "" }).success).toBe(false);
    expect(setupAreaKeySchema.safeParse({}).success).toBe(false);
  });
});
