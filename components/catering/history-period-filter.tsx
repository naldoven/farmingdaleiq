"use client";

import { useRouter } from "next/navigation";

import { ChipRow, FilterChip } from "@/components/mobile";
import { HISTORY_PERIODS, type HistoryPeriod } from "@/app/(app)/catering/logic";

/** Period toggle for the Order history card on /catering/history. Navigates
 * via the `period` search param rather than client state, so the filtered
 * list stays a server-rendered fetch. */
export function HistoryPeriodFilter({ period }: { period: HistoryPeriod }) {
  const router = useRouter();

  return (
    <ChipRow>
      {HISTORY_PERIODS.map((p) => (
        <FilterChip
          key={p}
          active={p === period}
          className="capitalize"
          onClick={() => router.push(`/catering/history?period=${p}`)}
        >
          {p}
        </FilterChip>
      ))}
    </ChipRow>
  );
}
