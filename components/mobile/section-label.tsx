import * as React from "react";

import { cn } from "@/lib/utils";

export interface SectionLabelProps
  extends React.HTMLAttributes<HTMLHeadingElement> {
  /** Optional right-aligned slot (a "See all" link, a count, etc.). */
  action?: React.ReactNode;
  as?: "h2" | "h3";
}

/**
 * Large bold section heading (the "Send / Assign / View" style labels from the
 * KitchenIQ home). 22px / 700 ink, with an optional trailing action.
 */
export function SectionLabel({
  children,
  action,
  as: Tag = "h2",
  className,
  ...props
}: SectionLabelProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Tag
        className={cn("text-[22px] font-bold leading-tight text-ink", className)}
        {...props}
      >
        {children}
      </Tag>
      {action ? <div className="shrink-0 text-sm">{action}</div> : null}
    </div>
  );
}
