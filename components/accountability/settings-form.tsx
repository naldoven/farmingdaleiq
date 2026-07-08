"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateAccountabilitySettings } from "@/app/(app)/accountability/actions";
import type { PeriodKind } from "@/app/(app)/accountability/logic";

/** Admin form for the store's accountability period (accountability.manage). */
export function AccountabilitySettingsForm({
  id,
  periodKind,
  periodDays,
}: {
  id: string;
  periodKind: string;
  periodDays: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [kind, setKind] = useState<PeriodKind>(periodKind === "fixed" ? "fixed" : "rolling");
  const [days, setDays] = useState(String(periodDays));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await updateAccountabilitySettings({
            id,
            periodKind: kind,
            periodDays: Number(days) || 1,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setSaved(true);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="period-kind" className="text-[13px] font-semibold text-ink">
          Period kind
        </label>
        <select
          id="period-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as PeriodKind)}
          className="h-10 rounded-lg border border-line bg-card px-3 text-[15px] text-ink"
        >
          <option value="rolling">Rolling</option>
          <option value="fixed">Fixed window</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="period-days" className="text-[13px] font-semibold text-ink">
          Period length (days)
        </label>
        <input
          id="period-days"
          type="number"
          min={1}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="h-10 w-28 rounded-lg border border-line bg-card px-3 text-[15px] text-ink"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-10 shrink-0 items-center rounded-full bg-accent px-4 text-[15px] font-semibold text-white transition-transform active:scale-95 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save"}
      </button>
      {error && <p className="w-full text-[13px] text-danger">{error}</p>}
      {saved && !error && <p className="w-full text-[13px] text-success">Saved.</p>}
    </form>
  );
}
