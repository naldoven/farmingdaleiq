"use server";

/**
 * Roles x permissions matrix server action (KITCHENIQ-PARITY-AUDIT.md
 * "People & Teams" [MED]: "No role/permission management UI — roles.manage
 * exists but nothing lets an admin view/edit role_permissions"). Same
 * permission-guard pattern as app/(app)/people/actions.ts: requirePermission
 * first, then a write through the per-request client so RLS
 * (role_permissions_write_manager, supabase/migrations/20260707001850_
 * people_teams_rls.sql) independently re-checks roles.manage.
 */

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/people/action-types";
import {
  setRolePermissionSchema,
  type SetRolePermissionInput,
} from "@/app/(app)/people/roles/validation";

/** Grants or revokes one permission key on one role. */
export async function setRolePermission(
  input: SetRolePermissionInput,
): Promise<ActionResult> {
  try {
    await requirePermission("roles.manage");
    const parsed = setRolePermissionSchema.parse(input);
    const supabase = await createClient();

    if (parsed.granted) {
      const { error } = await supabase
        .from("role_permissions")
        .upsert(
          { role_id: parsed.roleId, permission_key: parsed.permissionKey },
          { onConflict: "role_id,permission_key" },
        );

      if (error) {
        return { ok: false, error: error.message };
      }
    } else {
      const { error } = await supabase
        .from("role_permissions")
        .delete()
        .eq("role_id", parsed.roleId)
        .eq("permission_key", parsed.permissionKey);

      if (error) {
        return { ok: false, error: error.message };
      }
    }

    revalidatePath("/people/roles");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
