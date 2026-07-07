"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inviteUser } from "@/app/(app)/people/actions";
import type { RoleOption } from "@/components/people/role-assign-form";

const NO_ROLE_VALUE = "none";

/**
 * Invite/create-user form. Calls the permission-guarded `inviteUser` server
 * action (app/(app)/people/actions.ts), which uses the Supabase Auth admin
 * API (service role, server-only) to create the account and send the invite
 * email, then fills in the profile row.
 */
export function InviteForm({ roles }: { roles: RoleOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState(NO_ROLE_VALUE);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setDone(false);
        startTransition(async () => {
          const result = await inviteUser({
            name,
            email,
            phone,
            roleId: roleId === NO_ROLE_VALUE ? null : roleId,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setDone(true);
          setName("");
          setEmail("");
          setPhone("");
          setRoleId(NO_ROLE_VALUE);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-name">Name</Label>
        <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-phone">Phone</Label>
        <Input id="invite-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-role">Role</Label>
        <Select value={roleId} onValueChange={setRoleId}>
          <SelectTrigger id="invite-role">
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
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {done && <p className="text-sm text-success">Invite sent.</p>}

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Sending invite..." : "Send invite"}
        </Button>
      </div>
    </form>
  );
}
