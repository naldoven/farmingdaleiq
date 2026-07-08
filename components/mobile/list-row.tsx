import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type ListRowTone =
  | "neutral"
  | "accent"
  | "success"
  | "danger"
  | "warning"
  | "info";

const CHIP_TONE: Record<ListRowTone, string> = {
  neutral: "bg-secondary text-muted-ink",
  accent: "bg-accent-soft text-accent-ink",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
};

export interface ListRowProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Leading icon shown inside a tinted round chip. */
  icon?: LucideIcon;
  iconTone?: ListRowTone;
  /** Trailing content. Defaults to a chevron for interactive rows. */
  trailing?: React.ReactNode;
  href?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
  className?: string;
}

/**
 * One row in a list card: a tinted leading icon chip, a title with an optional
 * description, and a trailing chevron or badge. Becomes a link when `href` is
 * set, a button when `onClick` is set, otherwise a static row.
 */
export function ListRow({
  title,
  description,
  icon: Icon,
  iconTone = "neutral",
  trailing,
  href,
  onClick,
  className,
}: ListRowProps) {
  const interactive = Boolean(href || onClick);
  const trailingContent =
    trailing ??
    (interactive ? (
      <ChevronRight
        className="h-5 w-5 shrink-0 text-muted-ink"
        aria-hidden="true"
      />
    ) : null);

  const body = (
    <>
      {Icon && (
        <span
          className={cn(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            CHIP_TONE[iconTone],
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-ink">
          {title}
        </span>
        {description && (
          <span className="block truncate text-[13px] text-muted-ink">
            {description}
          </span>
        )}
      </span>
      {trailingContent}
    </>
  );

  const shared = cn(
    "flex w-full items-center gap-3 px-4 py-3 text-left",
    interactive && "transition-colors hover:bg-secondary/60",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={shared} onClick={onClick}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={shared} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className={shared}>{body}</div>;
}
