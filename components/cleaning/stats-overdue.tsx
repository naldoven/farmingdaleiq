import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { OverdueRowView } from "@/app/(app)/cleaning/stats-view";
import { SectionCard, StatusBadge } from "@/components/mobile";

/**
 * The rotating cleans furthest past due: the master list's red dots, worst
 * first. Each row opens the item so a leader can see its photo and what clean
 * looks like.
 */
export function StatsOverdue({ rows }: { rows: OverdueRowView[] }) {
  return (
    <SectionCard title="Most overdue" flush>
      <p className="px-4 pb-3 text-[13px] text-muted-ink">
        Rotating cleans furthest past due. Weekly cleans are not listed; they come back on their own.
      </p>
      {rows.length === 0 ? (
        <p className="border-t border-line px-4 py-4 text-[15px] text-muted-ink">
          Nothing is overdue. Every rotating clean is on schedule.
        </p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={row.href}
                className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/60"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[15px] font-semibold text-ink">{row.name}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone="danger" dot>
                      {row.badge}
                    </StatusBadge>
                    <span className="text-[13px] text-muted-ink">{row.zoneName}</span>
                  </span>
                  {row.lastText ? <span className="text-[13px] text-muted-ink">{row.lastText}</span> : null}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-ink" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
