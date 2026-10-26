import type { LeaderRowView, UnownedView } from "@/app/(app)/cleaning/stats-view";
import { StatCells } from "@/components/cleaning/stats-cells";
import { SectionCard } from "@/components/mobile";

/**
 * Shift leaders for the month, in name order with no rank, medals or "best":
 * the plan keeps v1 free of competition. The leader on a day's Morning Setup
 * owns its AM cleans and the Closing Setup leader owns the PM ones.
 */
export function StatsLeaders({ leaders, unowned }: { leaders: LeaderRowView[]; unowned: UnownedView | null }) {
  return (
    <SectionCard title="Shift leaders" flush>
      <p className="px-4 pb-3 text-[13px] text-muted-ink">
        Each clean counts for the leader on that day&apos;s Morning (AM) or Closing (PM) Setup.
      </p>
      {leaders.length === 0 ? (
        <p className="border-t border-line px-4 py-4 text-[15px] text-muted-ink">
          No cleans were credited to a leader this month.
        </p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {leaders.map((leader) => (
            <li key={leader.userId} className="flex flex-col gap-2 px-4 py-3">
              <span className="text-[15px] font-semibold text-ink">{leader.name}</span>
              <StatCells
                cells={[
                  { label: "Cleans", value: leader.owned },
                  { label: "On time", value: leader.pctText, tone: leader.tone },
                  { label: "Missed", value: leader.missed, tone: leader.missed > 0 ? "danger" : "neutral" },
                  { label: "Carried over", value: leader.carriedOver },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
      {unowned ? (
        <div className="flex flex-col gap-2 border-t border-line bg-secondary/40 px-4 py-3">
          <span className="text-[15px] font-semibold text-ink">No Setup posted</span>
          <StatCells
            cells={[
              { label: "Cleans", value: unowned.owed },
              { label: "On time", value: unowned.pctText, tone: unowned.tone },
              { label: "Missed", value: unowned.missed, tone: unowned.missed > 0 ? "danger" : "neutral" },
            ]}
          />
          <p className="text-[13px] text-muted-ink">
            Cleans on days without a posted Morning or Closing Setup cannot be credited to a leader.
          </p>
        </div>
      ) : null}
    </SectionCard>
  );
}
