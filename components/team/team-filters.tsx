"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ChipRow, FilterChip } from "@/components/mobile";

export interface TeamDayPartOption {
  id: string;
  name: string;
}

export type TeamSide = "foh" | "boh";

export interface TeamFiltersProps {
  dayParts: TeamDayPartOption[];
  selectedDayPartId: string;
  selectedSide: TeamSide;
}

/**
 * The Team dashboard's top ChipRow: a FOH/BOH side toggle, a static "Today"
 * label, and the day-part selector -- matching the KitchenIQ Team screen
 * (docs/DESIGN-SYSTEM.md).
 *
 * Only `dayPartId` actually drives any data below: Leadership, Setups, and
 * Breaks are each scoped to one setup (date + day-part), the same
 * granularity /setups and /breaks already use. `side` has no backing
 * dimension yet -- the seeded position_groups only has an "FOH" group
 * (supabase/migrations/20260707020100_training_seed.sql), no "BOH" group
 * exists to filter by -- so it's carried in the URL for KitchenIQ parity and
 * so a future BOH rollout has somewhere to plug in, but today it's a
 * display-only toggle. "Today" has nothing else to switch to (this
 * dashboard only ever shows today), so it's rendered as a fixed, non-toggle
 * chip rather than a fake control.
 */
export function TeamFilters({ dayParts, selectedDayPartId, selectedSide }: TeamFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <ChipRow aria-label="Team dashboard filters">
      <FilterChip
        type="button"
        active={selectedSide === "foh"}
        activeColor="accent"
        onClick={() => setParam("side", "foh")}
      >
        FOH
      </FilterChip>
      <FilterChip
        type="button"
        active={selectedSide === "boh"}
        activeColor="accent"
        onClick={() => setParam("side", "boh")}
      >
        BOH
      </FilterChip>
      <FilterChip type="button" active disabled className="cursor-default disabled:opacity-100">
        Today
      </FilterChip>
      {dayParts.map((dayPart) => (
        <FilterChip
          key={dayPart.id}
          type="button"
          active={dayPart.id === selectedDayPartId}
          onClick={() => setParam("dayPartId", dayPart.id)}
        >
          {dayPart.name}
        </FilterChip>
      ))}
    </ChipRow>
  );
}
