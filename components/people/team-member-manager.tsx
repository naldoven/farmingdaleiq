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
import { PersonRow } from "@/components/people/person-row";
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
      {members.length === 0 ? (
        <p className="text-[13px] text-muted-ink">No members yet.</p>
      ) : (
        <div className="-mx-4 flex flex-col divide-y divide-line">
          {members.map((member) => (
            <PersonRow
              key={member.id}
              name={member.name}
              trailing={
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
              }
            />
          ))}
        </div>
      )}

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
