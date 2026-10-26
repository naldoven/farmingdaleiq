"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setZoneActive } from "@/app/(app)/cleaning/settings-actions";
import { SectionCard } from "@/components/mobile";
import { cn } from "@/lib/utils";

export interface SettingsZone {
  id: string;
  name: string;
  color: string;
  areas: string;
  side: string;
  sort: number;
  active: boolean;
}

const SIDES = [
  { side: "boh", title: "Back of house" },
  { side: "foh", title: "Front of house" },
] as const;

function ZoneSwitch({
  zone,
  pending,
  onToggle,
}: {
  zone: SettingsZone;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={zone.active}
      aria-label={`${zone.name} zone on the weekly board`}
      disabled={pending}
      onClick={onToggle}
      className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-1 disabled:pointer-events-none disabled:opacity-50"
    >
      <span className="w-7 text-right text-[13px] font-semibold text-muted-ink" aria-hidden="true">
        {zone.active ? "On" : "Off"}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
          zone.active ? "bg-accent" : "bg-muted-ink/40",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all",
            zone.active ? "left-[22px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

/**
 * The six zones with an On/Off switch each. "On" means the zone's items join
 * the weekly board; FOH ships Off until the BOH beta is stable (plan "Build
 * phases"). The switch shows the saved state, so a failed save never looks
 * like it worked.
 */
export function SettingsZones({ zones }: { zones: SettingsZone[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(zone: SettingsZone) {
    setError(null);
    setPendingId(zone.id);
    startTransition(async () => {
      const result = await setZoneActive({ id: zone.id, active: !zone.active });
      setPendingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <SectionCard title="Zones on the weekly board">
      <div className="flex flex-col gap-4">
        <p className="text-[14px] text-muted-ink">
          Turning a zone on adds its items to the next weekly build.
        </p>

        {SIDES.map(({ side, title }) => {
          const sideZones = zones.filter((zone) => zone.side === side).sort((a, b) => a.sort - b.sort);
          if (sideZones.length === 0) return null;
          return (
            <section key={side} aria-label={title} className="flex flex-col">
              <h4 className="pb-1 text-[13px] font-semibold uppercase tracking-wide text-muted-ink">{title}</h4>
              <ul className="divide-y divide-line border-y border-line">
                {sideZones.map((zone) => (
                  <li key={zone.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-3 w-3 shrink-0 rounded-full ring-1 ring-black/15"
                        style={{ backgroundColor: zone.color }}
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="text-[15px] font-semibold text-ink">{zone.name}</span>
                        <span className="break-words text-[13px] text-muted-ink">{zone.areas}</span>
                      </div>
                    </div>
                    <ZoneSwitch zone={zone} pending={pendingId === zone.id} onToggle={() => toggle(zone)} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {error ? (
          <p role="alert" className="text-[14px] font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}
