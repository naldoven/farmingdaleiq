"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";

import { saveSlotCaps } from "@/app/(app)/cleaning/settings-actions";
import {
  CAP_MAX,
  CAP_MIN,
  capsEqual,
  gridToCaps,
  setCap,
  type CapHalf,
  type CapsGridRow,
} from "@/app/(app)/cleaning/settings-view";
import { SectionCard } from "@/components/mobile";
import { Button } from "@/components/ui/button";

const STEP_BUTTON =
  "inline-flex h-11 w-10 items-center justify-center rounded-lg border border-line bg-card text-ink transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-40";

function Stepper({
  value,
  label,
  disabled,
  onChange,
}: {
  value: number;
  /** "AM on Monday": what the number is, for screen readers. */
  label: string;
  disabled: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={label}>
      <button
        type="button"
        className={STEP_BUTTON}
        aria-label={`Fewer for ${label}`}
        disabled={disabled || value <= CAP_MIN}
        onClick={() => onChange(value - 1)}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span className="w-6 text-center text-[19px] font-semibold tabular-nums text-ink">{value}</span>
      <button
        type="button"
        className={STEP_BUTTON}
        aria-label={`More for ${label}`}
        disabled={disabled || value >= CAP_MAX}
        onClick={() => onChange(value + 1)}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The slot-cap grid: how many variable cleans the Thursday build may put in
 * each half-day. Edits stay on the phone until Save, so a half-finished set
 * of changes never reaches a build that runs at night.
 */
export function SettingsCapsGrid({ initial }: { initial: CapsGridRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(initial);
  const [grid, setGrid] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty = !capsEqual(saved, grid);

  function change(weekday: number, half: CapHalf, value: number) {
    setGrid((current) => setCap(current, weekday, half, value));
    setJustSaved(false);
    setError(null);
  }

  function save() {
    setError(null);
    setJustSaved(false);
    const snapshot = grid;
    startTransition(async () => {
      const result = await saveSlotCaps({ caps: gridToCaps(snapshot) });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(snapshot);
      setJustSaved(true);
      router.refresh();
    });
  }

  return (
    <SectionCard title="Variable cleans per half-day">
      <div className="flex flex-col gap-4">
        <p className="text-[14px] text-muted-ink">
          Most variable cleans the Thursday build puts in each half-day. 0 means none.
        </p>

        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 pb-2 text-[13px] font-semibold text-muted-ink">
            <span className="w-10 shrink-0">Day</span>
            <span className="flex-1 text-center">AM</span>
            <span className="flex-1 text-center">PM</span>
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {grid.map((row) => (
              <li key={row.weekday} className="flex items-center gap-1.5 py-2">
                <span className="w-10 shrink-0 text-[15px] font-semibold text-ink">{row.short}</span>
                <div className="flex flex-1 justify-center">
                  <Stepper
                    value={row.am}
                    label={`AM on ${row.name}`}
                    disabled={pending}
                    onChange={(next) => change(row.weekday, "am", next)}
                  />
                </div>
                <div className="flex flex-1 justify-center">
                  <Stepper
                    value={row.pm}
                    label={`PM on ${row.name}`}
                    disabled={pending}
                    onChange={(next) => change(row.weekday, "pm", next)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <Button className="h-12 w-full rounded-xl text-[16px]" disabled={pending || !dirty} onClick={save}>
          {pending ? "Saving..." : "Save caps"}
        </Button>
        {justSaved && !dirty ? (
          <p role="status" className="text-center text-[14px] font-medium text-success">
            Saved. The next build uses these.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-center text-[14px] font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}
