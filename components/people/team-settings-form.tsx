"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteTeam, renameTeam } from "@/app/(app)/people/teams/actions";

/** Rename or delete a team. Both call teams.manage-guarded actions. */
export function TeamSettingsForm({
  teamId,
  initialName,
}: {
  teamId: string;
  initialName: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await renameTeam({ id: teamId, name });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving..." : "Rename"}
        </Button>
      </form>

      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="w-fit"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm(`Delete team "${initialName}"? This removes all its members.`)) {
            return;
          }
          setError(null);
          startTransition(async () => {
            const result = await deleteTeam({ id: teamId });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push("/people/teams");
            router.refresh();
          });
        }}
      >
        Delete team
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
