import * as React from "react";

import { cn } from "@/lib/utils";

export type StatTone = "neutral" | "success" | "danger" | "warning";

const VALUE_TONE: Record<StatTone, string> = {
  neutral: "text-ink",
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
};

export interface StatTileProps extends React.HTMLAttributes<HTMLDivElement> {
  value: React.ReactNode;
  label: React.ReactNode;
  tone?: StatTone;
}

/**
 * Compact tile: a big metric number over a caption label. Tone colors only the
 * value so a scoreboard reads at a glance (green good, red alert, amber warn).
 */
export function StatTile({
  value,
  label,
  tone = "neutral",
  className,
  ...props
}: StatTileProps) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-line bg-card p-3",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "text-[30px] font-bold leading-none tabular-nums",
          VALUE_TONE[tone],
        )}
      >
        {value}
      </span>
      <span className="mt-1 text-[13px] text-muted-ink">{label}</span>
    </div>
  );
}
