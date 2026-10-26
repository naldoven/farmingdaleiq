import type { StatsTone, TrendBar } from "@/app/(app)/cleaning/stats-view";
import { SectionCard } from "@/components/mobile";
import { cn } from "@/lib/utils";

const BAR_TONE: Record<StatsTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-line",
};

/**
 * Store on-time % by week as plain CSS bars (no chart library for twelve
 * numbers). Every bar prints its percent above it and its week below, so
 * color is a hint, not the message. A week with nothing closed shows a dash
 * and an empty track.
 */
export function StatsTrend({ bars, failed = false }: { bars: TrendBar[]; failed?: boolean }) {
  return (
    <SectionCard title="Store trend">
      {failed ? (
        <p className="text-[15px] text-muted-ink">The weekly trend could not load. Reload the page to try again.</p>
      ) : bars.length === 0 ? (
        <p className="text-[15px] text-muted-ink">No cleans have been scored yet. The trend starts once the first day closes.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <ol aria-label="Cleans done on time, by week, oldest to newest" className="flex gap-1">
            {bars.map((bar) => (
              <li
                key={bar.weekStart}
                aria-label={bar.summary}
                className="flex min-w-0 flex-1 flex-col items-center gap-1"
              >
                <span className="text-[11px] font-semibold tabular-nums text-ink">{bar.pctText}</span>
                <span className="flex h-28 w-full items-end rounded-md bg-secondary/60">
                  <span
                    className={cn("block w-full rounded-md", BAR_TONE[bar.tone])}
                    style={{ height: `${bar.heightPct}%` }}
                  />
                </span>
                <span className="text-center text-[12px] leading-tight text-muted-ink">
                  {bar.label.split(" ").map((part, i) => (
                    <span key={i} className="block">
                      {part}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ol>
          <p className="text-[13px] text-muted-ink">
            Share of cleans done on or before their day, by week starting. Only days that have closed count.
          </p>
        </div>
      )}
    </SectionCard>
  );
}
