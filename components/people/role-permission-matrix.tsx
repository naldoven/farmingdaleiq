"use client";

import { Fragment, useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setRolePermission } from "@/app/(app)/people/roles/actions";
import type { PermissionGroup } from "@/app/(app)/people/roles/permission-groups";
import type { PermissionKey } from "@/lib/auth/permissions";

export interface RoleOption {
  id: string;
  name: string;
}

export interface RolePermissionMatrixProps {
  roles: RoleOption[];
  groups: PermissionGroup[];
  /** role_id -> granted permission_key[], as loaded server-side. */
  grantedKeysByRole: Record<string, string[]>;
}

function cellKey(roleId: string, permissionKey: string): string {
  return `${roleId}::${permissionKey}`;
}

/**
 * Roles x permission-keys editable matrix (KITCHENIQ-PARITY-AUDIT.md
 * "People & Teams" [MED]). Renders one row per permission key (grouped by
 * module), one column per role, a checkbox per cell. Toggling a checkbox
 * calls `setRolePermission` and optimistically updates; on failure it
 * reverts the checkbox and surfaces the error.
 */
export function RolePermissionMatrix({
  roles,
  groups,
  grantedKeysByRole,
}: RolePermissionMatrixProps) {
  const initialGranted = useMemo(() => {
    const set = new Set<string>();
    for (const [roleId, keys] of Object.entries(grantedKeysByRole)) {
      for (const key of keys) {
        set.add(cellKey(roleId, key));
      }
    }
    return set;
  }, [grantedKeysByRole]);

  const [granted, setGranted] = useState(initialGranted);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function toggle(roleId: string, permissionKey: PermissionKey, nextGranted: boolean) {
    const key = cellKey(roleId, permissionKey);
    setError(null);
    setGranted((prev) => {
      const next = new Set(prev);
      if (nextGranted) next.add(key);
      else next.delete(key);
      return next;
    });
    setPending((prev) => new Set(prev).add(key));

    setRolePermission({ roleId, permissionKey, granted: nextGranted })
      .then((result) => {
        if (!result.ok) {
          setError(result.error);
          setGranted((prev) => {
            const next = new Set(prev);
            if (nextGranted) next.delete(key);
            else next.add(key);
            return next;
          });
        }
      })
      .finally(() => {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Permission</TableHead>
            {roles.map((role) => (
              <TableHead key={role.id} className="text-center">
                {role.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <Fragment key={group.module}>
              <TableRow>
                <TableCell
                  colSpan={roles.length + 1}
                  className="bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {group.module}
                </TableCell>
              </TableRow>
              {group.keys.map((permissionKey) => (
                <TableRow key={permissionKey}>
                  <TableCell className="font-mono text-xs">{permissionKey}</TableCell>
                  {roles.map((role) => {
                    const key = cellKey(role.id, permissionKey);
                    return (
                      <TableCell key={role.id} className="text-center">
                        <Checkbox
                          checked={granted.has(key)}
                          disabled={pending.has(key)}
                          onCheckedChange={(checked) =>
                            toggle(role.id, permissionKey, checked === true)
                          }
                          aria-label={`${role.name}: ${permissionKey}`}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
