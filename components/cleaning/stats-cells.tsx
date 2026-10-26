import type { StatsTone } from "@/app/(app)/cleaning/stats-view";
import { cn } from "@/lib/utils";

const VALUE_TONE: Record<StatsTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-ink",
};

export interface StatCell {
  label: string;
  value: string | number;
  tone?: StatsTone;
}

/**
 * A row of small labeled numbers under a name. Labels sit under the value and
 * may wrap, so four fit across a narrow phone. The value is always printed,
 * so a tone color never carries the meaning alone.
 */
export function StatCells({ cells, className }: { cells: StatCell[]; className?: string }) {
  return (
    <dl className={cn("grid gap-2", className)} style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
      {cells.map((cell) => (
        <div key={cell.label} className="flex flex-col-reverse">
          <dt className="text-[12px] leading-tight text-muted-ink">{cell.label}</dt>
          <dd className={cn("text-[19px] font-bold leading-tight tabular-nums", VALUE_TONE[cell.tone ?? "neutral"])}>
            {cell.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
