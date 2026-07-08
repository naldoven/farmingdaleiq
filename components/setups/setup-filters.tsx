"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";

import { ChipRow, FilterChip } from "@/components/mobile";
import { cn } from "@/lib/utils";

export interface SetupDayPartOption {
  id: string;
  name: string;
  /** This date's setup for this day-part has been posted. */
  posted: boolean;
  /** This date's setup for this day-part exists (draft or posted). */
  exists: boolean;
}

export type SetupRosterView = "full-day" | "hourly";

export interface SetupFiltersProps {
  dayParts: SetupDayPartOption[];
  selectedDate: string;
  selectedDayPartId: string;
  rosterView: SetupRosterView;
}

/**
 * The Setup board's top controls: a date picker and a day-part ChipRow (each
 * chip carries a small posted/draft status dot), plus a full-day/hourly
 * roster toggle -- the KitchenIQ date/day-part chip pattern
 * (docs/DESIGN-SYSTEM.md), matching components/team/team-filters.tsx.
 * Visual/layout only: still drives the same `date`/`dayPartId`/`view` query
 * params the server page already reads.
 */
export function SetupFilters({ dayParts, selectedDate, selectedDayPartId, rosterView }: SetupFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="sr-only">Date</span>
        <CalendarDays
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-ink"
          aria-hidden="true"
        />
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setParam("date", e.target.value)}
          className="h-11 w-full rounded-full border border-line bg-card pl-9 pr-4 text-[15px] text-ink focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        />
      </label>

      <ChipRow aria-label="Day-part filter">
        {dayParts.map((dayPart) => (
          <FilterChip
            key={dayPart.id}
            type="button"
            active={dayPart.id === selectedDayPartId}
            activeColor="accent"
            onClick={() => setParam("dayPartId", dayPart.id)}
          >
            <span className="inline-flex items-center gap-1.5">
              {dayPart.name}
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  dayPart.posted ? "bg-success" : dayPart.exists ? "bg-warning" : "bg-transparent",
                )}
              />
            </span>
          </FilterChip>
        ))}
      </ChipRow>

      <ChipRow aria-label="Roster view">
        <FilterChip
          type="button"
          active={rosterView === "full-day"}
          onClick={() => setParam("view", "full-day")}
        >
          Full-day roster
        </FilterChip>
        <FilterChip type="button" active={rosterView === "hourly"} onClick={() => setParam("view", "hourly")}>
          Hourly roster
        </FilterChip>
      </ChipRow>
    </div>
  );
}
