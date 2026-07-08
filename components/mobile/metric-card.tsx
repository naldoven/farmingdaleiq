import * as React from "react";

import { cn } from "@/lib/utils";

export interface MetricCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  value: React.ReactNode;
  /** Sub-line under the value, e.g. "0% Completed". */
  subline?: React.ReactNode;
  /** Optional leading/trailing adornment (icon chip, badge). */
  adornment?: React.ReactNode;
}

/**
 * White rounded card with a small title, one big metric value, and an optional
 * sub-line. Used for the single-number cards on the home and report screens.
 */
export function MetricCard({
  title,
  value,
  subline,
  adornment,
  className,
  ...props
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-2xl border border-line bg-card p-4 shadow-card",
        className,
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-muted-ink">{title}</span>
        {adornment}
      </div>
      <span className="text-[32px] font-bold leading-none tabular-nums text-ink">
        {value}
      </span>
      {subline && (
        <span className="text-[13px] text-muted-ink">{subline}</span>
      )}
    </div>
  );
}
