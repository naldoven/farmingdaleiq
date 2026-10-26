import type { AreaRowView } from "@/app/(app)/cleaning/stats-view";
import { StatCells } from "@/components/cleaning/stats-cells";
import { ZoneDot } from "@/components/cleaning/week-card";
import { SectionCard } from "@/components/mobile";

/** Completion by area for the month, in the master list's area order. */
export function StatsAreas({ areas }: { areas: AreaRowView[] }) {
  return (
    <SectionCard title="Areas" flush>
      <p className="px-4 pb-3 text-[13px] text-muted-ink">How many of each area&apos;s cleans were done on their day.</p>
      {areas.length === 0 ? (
        <p className="border-t border-line px-4 py-4 text-[15px] text-muted-ink">No areas were scored this month.</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {areas.map((area) => (
            <li key={area.zoneId} className="flex flex-col gap-2 px-4 py-3">
              <span className="flex items-center gap-2">
                <ZoneDot color={area.color} />
                <span className="text-[15px] font-semibold text-ink">{area.name}</span>
              </span>
              <StatCells
                cells={[
                  { label: "Cleans", value: area.owed },
                  { label: "On time", value: area.pctText, tone: area.tone },
                  { label: "Missed", value: area.missed, tone: area.missed > 0 ? "danger" : "neutral" },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
