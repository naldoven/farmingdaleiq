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
import { SetupLinkPanel } from "@/components/people/setup-link-panel";

const NO_ROLE_VALUE = "none";

/**
 * Add-a-person form. Calls the permission-guarded `inviteUser` server action
 * (app/(app)/people/actions.ts), which creates the account with the Supabase
 * Auth admin API (service role, server-only), fills in the profile row, and
 * returns a one-time setup link. No email is sent: the manager texts or
 * shares the link (docs/STAFF-SIGN-IN-PLAN.md, Step 3).
 */
export function InviteForm({ roles }: { roles: RoleOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ name: string; link: string | null } | null>(null);
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
        setAdded(null);
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
          setAdded({ name: name.trim(), link: result.data.link });
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
      {added?.link ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-success">{added.name} was added.</p>
          <SetupLinkPanel name={added.name} link={added.link} />
        </div>
      ) : added ? (
        <p className="text-sm text-success">
          {added.name} was added, but the setup link did not work. Open their profile and tap New
          setup link.
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding..." : "Add person"}
        </Button>
      </div>
    </form>
  );
}
