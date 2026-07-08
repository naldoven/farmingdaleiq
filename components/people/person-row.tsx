import * as React from "react";
import Link from "next/link";

import { AvatarInitials } from "@/components/mobile";
import { cn } from "@/lib/utils";

export interface PersonRowProps {
  name: string;
  description?: React.ReactNode;
  /** Extra content under the description, e.g. a wrapping row of badge chips. */
  meta?: React.ReactNode;
  /** Trailing content (StatusBadge, chevron, a Remove button, etc.). */
  trailing?: React.ReactNode;
  href?: string;
  avatarSize?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * One row in a people list: a round AvatarInitials chip, a bold name with an
 * optional gray description line, and trailing content. Mirrors
 * components/mobile/list-row.tsx's layout/spacing exactly, swapping the
 * LucideIcon leading chip for a name-derived avatar (docs/DESIGN-SYSTEM.md
 * "AvatarInitials"). Link when `href` is set, otherwise a static row so
 * callers (team member managers, read-only rosters) can supply their own
 * trailing controls.
 */
export function PersonRow({
  name,
  description,
  meta,
  trailing,
  href,
  avatarSize = "md",
  className,
}: PersonRowProps) {
  const body = (
    <>
      <AvatarInitials name={name} size={avatarSize} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-ink">
          {name}
        </span>
        {description && (
          <span className="block truncate text-[13px] text-muted-ink">
            {description}
          </span>
        )}
        {meta && <span className="mt-1 block">{meta}</span>}
      </span>
      {trailing}
    </>
  );

  const shared = cn(
    "flex w-full items-center gap-3 px-4 py-3 text-left",
    href && "transition-colors hover:bg-secondary/60",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={shared}>
        {body}
      </Link>
    );
  }

  return <div className={shared}>{body}</div>;
}
