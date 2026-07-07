"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { issueInfraction } from "@/app/(app)/accountability/actions";

interface PersonOption {
  id: string;
  name: string;
}

interface InfractionTypeOption {
  id: string;
  name: string;
  points: number;
}

/**
 * Leader-facing "issue an infraction" form (accountability.issue). Calls the
 * permission-guarded issueInfraction action; the recipient is never shown who
 * issued it (see app/(app)/accountability/actions.ts doc comment).
 */
export function IssueInfractionForm({
  people,
  types,
}: {
  people: PersonOption[];
  types: InfractionTypeOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [userId, setUserId] = useState(people[0]?.id ?? "");
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        if (!userId || !typeId) {
          setError("Pick a person and an infraction type.");
          return;
        }
        startTransition(async () => {
          const result = await issueInfraction({ userId, typeId, note });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setNote("");
          setSuccess(
            result.data.triggeredActionTypeIds.length > 0
              ? "Infraction issued. A disciplinary action was triggered."
              : "Infraction issued.",
          );
          router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="infraction-person" className="text-sm font-medium">
            Person
          </label>
          <select
            id="infraction-person"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
            required
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="infraction-type" className="text-sm font-medium">
            Infraction type
          </label>
          <select
            id="infraction-type"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
            required
          >
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.points} pts)
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="infraction-note" className="text-sm font-medium">
          Note (optional)
        </label>
        <Textarea
          id="infraction-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Context for this infraction"
          rows={2}
        />
      </div>

      <div>
        <Button type="submit" disabled={isPending || !userId || !typeId}>
          {isPending ? "Issuing..." : "Issue infraction"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-success">{success}</p>}
    </form>
  );
}
