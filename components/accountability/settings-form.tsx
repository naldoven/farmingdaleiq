"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      className="flex flex-wrap items-end gap-2"
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
        <label htmlFor="period-kind" className="text-sm font-medium">
          Period kind
        </label>
        <select
          id="period-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as PeriodKind)}
          className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
        >
          <option value="rolling">Rolling</option>
          <option value="fixed">Fixed window</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="period-days" className="text-sm font-medium">
          Period length (days)
        </label>
        <Input
          id="period-days"
          type="number"
          min={1}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="w-28"
        />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save"}
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
      {saved && !error && <p className="w-full text-sm text-success">Saved.</p>}
    </form>
  );
}
