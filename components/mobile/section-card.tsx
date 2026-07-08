import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface SectionCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  /** Right-aligned header slot (badge, count, menu). */
  action?: React.ReactNode;
  /** When set, the header becomes a link with a trailing chevron (expand). */
  expandHref?: string;
  /** Remove the default inner padding (for edge-to-edge ListRow lists). */
  flush?: boolean;
}

/**
 * White rounded card that groups related content, with an optional title row
 * and an "expand" chevron that links deeper. The building block most home and
 * detail sections sit inside. Pass `flush` to drop padding when the body is a
 * list of ListRows that should run edge to edge.
 */
export function SectionCard({
  title,
  action,
  expandHref,
  flush = false,
  className,
  children,
  ...props
}: SectionCardProps) {
  const header = title ? (
    <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
      <h3 className="text-[19px] font-semibold text-ink">{title}</h3>
      <div className="flex items-center gap-1 text-sm">
        {action}
        {expandHref && (
          <Link
            href={expandHref}
            aria-label={`Open ${typeof title === "string" ? title : "section"}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-ink hover:bg-secondary"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  ) : null;

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-line bg-card shadow-card",
        className,
      )}
      {...props}
    >
      {header}
      <div className={cn(!flush && "p-4", title && !flush && "pt-0")}>
        {children}
      </div>
    </section>
  );
}
