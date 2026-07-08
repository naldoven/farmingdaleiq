"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOwnProfile } from "@/app/(app)/people/actions";

export interface SelfProfileEditFormProps {
  initialPhone: string | null;
  initialBirthdate: string | null;
  initialAvatarUrl: string | null;
}

/**
 * Self-service edit of the caller's own phone/birthdate/avatar_url
 * (KITCHENIQ-PARITY-AUDIT.md "People & Teams" [MED]: "No self-service edit
 * path despite the DB layer allowing one"). Rendered on /people/[id] only
 * when the viewer is looking at their own profile and lacks people.manage
 * (an admin still edits through the full ProfileEditForm). Calls
 * `updateOwnProfile` (app/(app)/people/actions.ts), which is scoped to
 * auth.uid() server-side regardless of what profileId the page renders.
 */
export function SelfProfileEditForm({
  initialPhone,
  initialBirthdate,
  initialAvatarUrl,
}: SelfProfileEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [birthdate, setBirthdate] = useState(initialBirthdate ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? "");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setDone(false);
        startTransition(async () => {
          const result = await updateOwnProfile({ phone, birthdate, avatarUrl });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setDone(true);
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="self-phone">Phone</Label>
          <Input id="self-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="self-birthdate">Birthdate</Label>
          <Input
            id="self-birthdate"
            type="date"
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="self-avatarUrl">Avatar URL</Label>
          <Input
            id="self-avatarUrl"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {done && !error && <p className="text-sm text-success">Saved.</p>}

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
