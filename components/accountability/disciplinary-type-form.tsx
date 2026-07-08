"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
      className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-line p-3"
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
      <input
        aria-label="New disciplinary action name"
        placeholder="Action name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="h-9 max-w-xs flex-1 rounded-full border border-line bg-card px-3.5 text-[13px] text-ink placeholder:text-muted-ink"
      />
      <input
        aria-label="Threshold points"
        type="number"
        min={1}
        placeholder="Threshold pts"
        value={threshold}
        onChange={(e) => setThreshold(e.target.value)}
        className="h-9 w-28 rounded-full border border-line bg-card px-3.5 text-[13px] text-ink placeholder:text-muted-ink"
        required
      />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-9 shrink-0 items-center rounded-full bg-accent px-4 text-[13px] font-semibold text-white transition-transform active:scale-95 disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add"}
      </button>
      {error && <p className="w-full text-[13px] text-danger">{error}</p>}
    </form>
  );
}
