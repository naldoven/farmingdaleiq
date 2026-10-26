import { ChevronDown } from "lucide-react";

import type { TodayDayGroup } from "@/app/(app)/cleaning/today-view";
import { TodayCardRow } from "@/components/cleaning/today-card";

/**
 * "Later this week": planned cleans on days after today, collapsed by default
 * so the screen stays about the shift in hand. A native <details> keeps it
 * working without JavaScript. Completing early is allowed and counts as on
 * time (plan "How a week runs", step 4), so these cards carry the same
 * buttons as today's.
 */
export function TodayLater({ groups, count }: { groups: TodayDayGroup[]; count: number }) {
  if (groups.length === 0) return null;
  return (
    <details className="group overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-[19px] font-semibold text-ink">
          Later this week <span className="text-muted-ink">{count}</span>
        </span>
        <ChevronDown className="size-5 text-muted-ink transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="flex flex-col gap-4 border-t border-line pb-2 pt-3">
        {groups.map((group) => (
          <section key={group.date} aria-label={group.label} className="flex flex-col">
            <h3 className="px-4 pb-1 text-[15px] font-bold text-ink">{group.label}</h3>
            <ul className="divide-y divide-line border-y border-line">
              {group.cards.map((card) => (
                <TodayCardRow key={card.id} card={card} interactive showHalf />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}
