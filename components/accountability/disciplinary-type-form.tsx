"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { upsertDisciplinaryActionType } from "@/app/(app)/accountability/actions";

/** Admin add form for a new disciplinary ladder rung (accountability.manage). */
export function DisciplinaryTypeCreateForm({ nextSort }: { nextSort: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const thresholdNumber = Number(threshold);
        if (!thresholdNumber || thresholdNumber < 1) {
          setError("Threshold must be a positive number.");
          return;
        }
        startTransition(async () => {
          const result = await upsertDisciplinaryActionType({
            name,
            thresholdPoints: thresholdNumber,
            description: "",
            sort: nextSort,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setName("");
          setThreshold("");
          router.refresh();
        });
      }}
    >
      <Input
        aria-label="New disciplinary action name"
        placeholder="Action name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="max-w-xs"
      />
      <Input
        aria-label="Threshold points"
        type="number"
        min={1}
        placeholder="Threshold pts"
        value={threshold}
        onChange={(e) => setThreshold(e.target.value)}
        className="w-32"
        required
      />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Adding..." : "Add"}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
