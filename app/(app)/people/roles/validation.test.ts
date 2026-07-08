import { describe, expect, it } from "vitest";

import { PERMISSION_KEYS } from "@/lib/auth/permissions";
import { setRolePermissionSchema } from "./validation";

describe("setRolePermissionSchema", () => {
  const roleId = "11111111-1111-4111-8111-111111111111";

  it("accepts a known permission key with granted true", () => {
    const result = setRolePermissionSchema.safeParse({
      roleId,
      permissionKey: PERMISSION_KEYS[0],
      granted: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts granted false (revoking)", () => {
    const result = setRolePermissionSchema.safeParse({
      roleId,
      permissionKey: PERMISSION_KEYS[0],
      granted: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown permission key", () => {
    const result = setRolePermissionSchema.safeParse({
      roleId,
      permissionKey: "not.a.real.key",
      granted: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid roleId", () => {
    const result = setRolePermissionSchema.safeParse({
      roleId: "team-leader",
      permissionKey: PERMISSION_KEYS[0],
      granted: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing granted flag", () => {
    const result = setRolePermissionSchema.safeParse({
      roleId,
      permissionKey: PERMISSION_KEYS[0],
    });
    expect(result.success).toBe(false);
  });
});
