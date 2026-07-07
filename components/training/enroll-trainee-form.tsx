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
import { enrollTrainee } from "@/app/(app)/training/grid/actions";

const UNSET = "unset";

export function EnrollTraineeForm({
  roadmapId,
  people,
}: {
  roadmapId: string;
  people: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [userId, setUserId] = useState(UNSET);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (userId === UNSET) return;
        setError(null);
        startTransition(async () => {
          const result = await enrollTrainee({ userId, roadmapId });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setUserId(UNSET);
          router.refresh();
        });
      }}
    >
      <Select value={userId} onValueChange={setUserId}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Enroll a trainee..." />
        </SelectTrigger>
        <SelectContent>
          {people.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" disabled={isPending || userId === UNSET}>
        Enroll
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
