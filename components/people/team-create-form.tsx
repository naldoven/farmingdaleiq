"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTeam } from "@/app/(app)/people/teams/actions";

/** Creates a new team. Calls the permission-guarded `createTeam` action (teams.manage). */
export function TeamCreateForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createTeam({ name });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setName("");
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Input
          aria-label="New team name"
          placeholder="New team name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create team"}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
