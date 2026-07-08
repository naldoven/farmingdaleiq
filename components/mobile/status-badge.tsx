import * as React from "react";

import { cn } from "@/lib/utils";

export type StatusTone =
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "neutral"
  | "accent";

const TONE: Record<StatusTone, string> = {
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  neutral: "bg-secondary text-muted-ink",
  accent: "bg-accent-soft text-accent-ink",
};

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  /** Show a leading status dot. */
  dot?: boolean;
}

/**
 * Soft rounded status pill (the "Active" green badge and its siblings). Color
 * is a tint plus a same-hue text so it stays legible; the label carries the
 * meaning, not the color alone.
 */
export function StatusBadge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        TONE[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-current"
        />
      )}
      {children}
    </span>
  );
}
