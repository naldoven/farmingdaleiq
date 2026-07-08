"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
          <label htmlFor="infraction-person" className="text-[13px] font-semibold text-ink">
            Person
          </label>
          <select
            id="infraction-person"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-10 rounded-lg border border-line bg-card px-3 text-[15px] text-ink"
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
          <label htmlFor="infraction-type" className="text-[13px] font-semibold text-ink">
            Infraction type
          </label>
          <select
            id="infraction-type"
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            className="h-10 rounded-lg border border-line bg-card px-3 text-[15px] text-ink"
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
        <label htmlFor="infraction-note" className="text-[13px] font-semibold text-ink">
          Note (optional)
        </label>
        <textarea
          id="infraction-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Context for this infraction"
          rows={2}
          className="rounded-lg border border-line bg-card px-3 py-2 text-[15px] text-ink placeholder:text-muted-ink"
        />
      </div>

      <div>
        <button
          type="submit"
          disabled={isPending || !userId || !typeId}
          className="inline-flex h-10 items-center rounded-full bg-accent px-4 text-[15px] font-semibold text-white transition-transform active:scale-95 disabled:opacity-50"
        >
          {isPending ? "Issuing…" : "Issue infraction"}
        </button>
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}
      {success && <p className="text-[13px] text-success">{success}</p>}
    </form>
  );
}
