"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile } from "@/app/(app)/people/actions";

export interface ProfileEditFormProps {
  profileId: string;
  initialName: string;
  initialPhone: string | null;
  initialDiscordUserId: string | null;
  initialBirthdate: string | null;
  initialHiredOn: string | null;
  initialAvatarUrl: string | null;
  initialActive: boolean;
  /** false when the viewer lacks people.manage — renders read-only. */
  canEdit: boolean;
}

/**
 * Edits contact fields, birthdate, hired_on, discord_user_id, and active
 * status for one profile (ARCHITECTURE.md "/people" page-map row; PLAN.md P0
 * #6). Calls the permission-guarded `updateProfile` server action — see the
 * pattern comment at the top of app/(app)/people/actions.ts.
 */
export function ProfileEditForm({
  profileId,
  initialName,
  initialPhone,
  initialDiscordUserId,
  initialBirthdate,
  initialHiredOn,
  initialAvatarUrl,
  initialActive,
  canEdit,
}: ProfileEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [discordUserId, setDiscordUserId] = useState(initialDiscordUserId ?? "");
  const [birthdate, setBirthdate] = useState(initialBirthdate ?? "");
  const [hiredOn, setHiredOn] = useState(initialHiredOn ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? "");
  const [active, setActive] = useState(initialActive);

  if (!canEdit) {
    return (
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <Field label="Name" value={name} />
        <Field label="Phone" value={phone || "—"} />
        <Field label="Discord user ID" value={discordUserId || "—"} />
        <Field label="Birthdate" value={birthdate || "—"} />
        <Field label="Hired on" value={hiredOn || "—"} />
        <Field label="Avatar URL" value={avatarUrl || "—"} />
        <Field label="Status" value={active ? "Active" : "Inactive"} />
      </dl>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await updateProfile({
            id: profileId,
            name,
            phone,
            discordUserId,
            birthdate,
            hiredOn,
            avatarUrl,
            active,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="discordUserId">Discord user ID</Label>
          <Input
            id="discordUserId"
            value={discordUserId}
            onChange={(e) => setDiscordUserId(e.target.value)}
            placeholder="For @mentions"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="birthdate">Birthdate</Label>
          <Input
            id="birthdate"
            type="date"
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hiredOn">Hired on</Label>
          <Input
            id="hiredOn"
            type="date"
            value={hiredOn}
            onChange={(e) => setHiredOn(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="avatarUrl">Avatar URL</Label>
          <Input
            id="avatarUrl"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Checkbox
            id="active"
            checked={active}
            onCheckedChange={(checked) => setActive(checked === true)}
          />
          <Label htmlFor="active">Active</Label>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
