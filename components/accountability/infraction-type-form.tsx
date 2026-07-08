"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
      className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-line p-3"
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
      <input
        aria-label="New infraction type name"
        placeholder="Infraction type name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        className="h-9 max-w-xs flex-1 rounded-full border border-line bg-card px-3.5 text-[13px] text-ink placeholder:text-muted-ink"
      />
      <input
        aria-label="Points"
        type="number"
        min={0}
        value={points}
        onChange={(e) => setPoints(e.target.value)}
        className="h-9 w-20 rounded-full border border-line bg-card px-3.5 text-[13px] text-ink"
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
