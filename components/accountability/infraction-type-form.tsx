"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { upsertInfractionType } from "@/app/(app)/accountability/actions";

/** Admin add form for a new infraction type (accountability.manage). */
export function InfractionTypeCreateForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [points, setPoints] = useState("0");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await upsertInfractionType({
            name,
            points: Number(points) || 0,
            description: "",
            active: true,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setName("");
          setPoints("0");
          router.refresh();
        });
      }}
    >
      <Input
        aria-label="New infraction type name"
        placeholder="Infraction type name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="max-w-xs"
      />
      <Input
        aria-label="Points"
        type="number"
        min={0}
        value={points}
        onChange={(e) => setPoints(e.target.value)}
        className="w-24"
      />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Adding..." : "Add"}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
