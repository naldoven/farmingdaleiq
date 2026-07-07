import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS } from "./permissions";

describe("PERMISSION_KEYS", () => {
  it("is a non-empty list of unique, dot-namespaced keys", () => {
    expect(Array.isArray(PERMISSION_KEYS)).toBe(true);
    expect(PERMISSION_KEYS.length).toBeGreaterThan(0);

    const unique = new Set(PERMISSION_KEYS);
    expect(unique.size).toBe(PERMISSION_KEYS.length);

    for (const key of PERMISSION_KEYS) {
      expect(key).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });
});
