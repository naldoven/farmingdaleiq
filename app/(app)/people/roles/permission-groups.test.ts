import { describe, expect, it } from "vitest";

import { PERMISSION_KEYS, type PermissionKey } from "@/lib/auth/permissions";
import { groupPermissionKeys } from "./permission-groups";

describe("groupPermissionKeys", () => {
  it("buckets keys by their dot-prefix module, preserving first-seen order", () => {
    const keys = [
      "people.manage",
      "tasks.manage",
      "people.view",
      "tasks.complete",
    ] as PermissionKey[];

    const groups = groupPermissionKeys(keys);

    expect(groups).toEqual([
      { module: "people", keys: ["people.manage", "people.view"] },
      { module: "tasks", keys: ["tasks.manage", "tasks.complete"] },
    ]);
  });

  it("returns an empty array for no keys", () => {
    expect(groupPermissionKeys([])).toEqual([]);
  });

  it("covers every real PERMISSION_KEYS entry exactly once with no default arg", () => {
    const groups = groupPermissionKeys();
    const flattened = groups.flatMap((g) => g.keys);
    expect(flattened.length).toBe(PERMISSION_KEYS.length);
    expect(new Set(flattened).size).toBe(PERMISSION_KEYS.length);
    for (const key of PERMISSION_KEYS) {
      expect(flattened).toContain(key);
    }
  });
});
