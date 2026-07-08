import { z } from "zod";

import { PERMISSION_KEYS, type PermissionKey } from "@/lib/auth/permissions";

const KNOWN_PERMISSION_KEYS: readonly string[] = PERMISSION_KEYS;

/**
 * Input validation for the roles/permissions matrix server action
 * (app/(app)/people/roles/actions.ts). permission_key has no CHECK
 * constraint in the database (supabase/migrations/20260707000200_core.sql),
 * so this refine is the one place that keeps writes limited to permission
 * keys the app actually knows about.
 */
export const setRolePermissionSchema = z.object({
  roleId: z.string().uuid(),
  permissionKey: z.string().refine((v): v is PermissionKey => KNOWN_PERMISSION_KEYS.includes(v), {
    message: "Unknown permission key",
  }),
  granted: z.boolean(),
});

export type SetRolePermissionInput = z.infer<typeof setRolePermissionSchema>;
