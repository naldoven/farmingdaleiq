import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RolePermissionMatrix } from "@/components/people/role-permission-matrix";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { groupPermissionKeys } from "@/app/(app)/people/roles/permission-groups";

/**
 * /people/roles — roles x permission-keys management matrix
 * (KITCHENIQ-PARITY-AUDIT.md "People & Teams" [MED]: "roles.manage exists
 * but nothing lets an admin view/edit role_permissions"). Admin-only
 * (roles.manage); writes go through the RLS-backstopped
 * `setRolePermission` action in app/(app)/people/roles/actions.ts.
 */
export default async function RolesPermissionsPage() {
  await requirePermission("roles.manage");

  const supabase = await createClient();

  const [{ data: roles }, { data: rolePermissions }] = await Promise.all([
    supabase.from("roles").select("id, name, rank").order("rank"),
    supabase.from("role_permissions").select("role_id, permission_key"),
  ]);

  const grantedKeysByRole: Record<string, string[]> = {};
  for (const rp of rolePermissions ?? []) {
    (grantedKeysByRole[rp.role_id] ??= []).push(rp.permission_key);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Roles &amp; permissions</h1>
        <Link href="/people" className="text-sm text-muted-foreground hover:underline">
          &larr; Roster
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Permission matrix</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <RolePermissionMatrix
            roles={(roles ?? []).map((r) => ({ id: r.id, name: r.name }))}
            groups={groupPermissionKeys()}
            grantedKeysByRole={grantedKeysByRole}
          />
        </CardContent>
      </Card>
    </div>
  );
}
