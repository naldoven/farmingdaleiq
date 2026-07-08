import * as React from "react";

import { cn } from "@/lib/utils";

export interface ProgressBarProps {
  /** 0-100. Clamped into range. */
  value: number;
  tone?: "accent" | "success" | "warning" | "danger";
  /** Show the "NN%" label on the right. */
  showLabel?: boolean;
  /** Optional label shown above the track (e.g. "Completed"). */
  label?: React.ReactNode;
  className?: string;
}

const FILL: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/**
 * Horizontal progress track with an accent (or semantic) fill and an optional
 * percentage label. Exposes ARIA progressbar semantics so the value is read to
 * assistive tech.
 */
export function ProgressBar({
  value,
  tone = "accent",
  showLabel = true,
  label,
  className,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {(label || showLabel) && (
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-ink">{label}</span>
          {showLabel && (
            <span className="font-semibold tabular-nums text-ink">{pct}%</span>
          )}
        </div>
      )}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-full rounded-full transition-[width]", FILL[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
