"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assignRole } from "@/app/(app)/people/actions";

const NO_ROLE_VALUE = "none";

export interface RoleOption {
  id: string;
  name: string;
}

export interface RoleAssignFormProps {
  profileId: string;
  initialRoleId: string | null;
  roles: RoleOption[];
  /** false when the viewer lacks people.manage — renders read-only. */
  canEdit: boolean;
}

/**
 * Changes a profile's assigned role. Calls the permission-guarded
 * `assignRole` server action (app/(app)/people/actions.ts) — a distinct
 * action from `updateProfile` per PLAN.md P0 #6's separate "Role assignment
 * UI on the profile (change role_id)" deliverable.
 */
export function RoleAssignForm({
  profileId,
  initialRoleId,
  roles,
  canEdit,
}: RoleAssignFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [roleId, setRoleId] = useState(initialRoleId ?? NO_ROLE_VALUE);

  const currentRoleName = roles.find((r) => r.id === initialRoleId)?.name ?? "No role";

  if (!canEdit) {
    return <p className="text-sm">{currentRoleName}</p>;
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await assignRole({
            id: profileId,
            roleId: roleId === NO_ROLE_VALUE ? null : roleId,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <Select value={roleId} onValueChange={setRoleId}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="No role" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_ROLE_VALUE}>No role</SelectItem>
          {roles.map((role) => (
            <SelectItem key={role.id} value={role.id}>
              {role.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Saving..." : "Change role"}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
