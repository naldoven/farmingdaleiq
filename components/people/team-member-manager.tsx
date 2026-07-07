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
import { addTeamMember, removeTeamMember } from "@/app/(app)/people/teams/actions";

export interface MemberOption {
  id: string;
  name: string;
}

/** Add/remove members of one team. Calls teams.manage-guarded actions. */
export function TeamMemberManager({
  teamId,
  members,
  addableProfiles,
}: {
  teamId: string;
  members: MemberOption[];
  addableProfiles: MemberOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {members.length === 0 && (
          <li className="text-sm text-muted-foreground">No members yet.</li>
        )}
        {members.map((member) => (
          <li
            key={member.id}
            className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
          >
            <span>{member.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await removeTeamMember({ teamId, userId: member.id });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  router.refresh();
                });
              }}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>

      {addableProfiles.length > 0 && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!selected) return;
            setError(null);
            startTransition(async () => {
              const result = await addTeamMember({ teamId, userId: selected });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setSelected("");
              router.refresh();
            });
          }}
        >
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Add a person..." />
            </SelectTrigger>
            <SelectContent>
              {addableProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" size="sm" disabled={isPending || !selected}>
            {isPending ? "Adding..." : "Add member"}
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
