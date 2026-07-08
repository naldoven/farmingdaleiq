import * as React from "react";

import { cn } from "@/lib/utils";

export interface FilterChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  /** Fill color when active. */
  activeColor?: "navy" | "accent";
}

/**
 * Pill-shaped filter toggle. Inactive is a quiet outline; active fills solid
 * navy (default) or accent red. Uses aria-pressed so the toggle state is not
 * conveyed by color alone.
 */
export function FilterChip({
  active = false,
  activeColor = "navy",
  className,
  children,
  ...props
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
        active
          ? activeColor === "accent"
            ? "border-accent bg-accent text-white"
            : "border-ink bg-ink text-white"
          : "border-line bg-card text-muted-ink hover:bg-secondary",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export type ChipRowProps = React.HTMLAttributes<HTMLDivElement>;

/** Horizontal, scrollable row of FilterChips. */
export function ChipRow({ className, children, ...props }: ChipRowProps) {
  return (
    <div
      className={cn(
        "no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
