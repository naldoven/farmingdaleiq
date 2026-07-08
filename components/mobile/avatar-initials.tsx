import * as React from "react";

import { avatarColor, initialsFromName } from "@/lib/nav/page-map";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
} as const;

export interface AvatarInitialsProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  /** Full name; drives both the initials and the deterministic color. */
  name: string;
  size?: keyof typeof SIZES;
}

/**
 * Round avatar showing 1-2 initials over a soft, deterministic color derived
 * from the name (same name always yields the same color). Decorative by
 * default: the name is exposed to assistive tech via the title/aria-label.
 */
export function AvatarInitials({
  name,
  size = "md",
  className,
  ...props
}: AvatarInitialsProps) {
  const { bg, fg } = avatarColor(name);
  const initials = initialsFromName(name) || "?";

  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: bg, color: fg }}
      {...props}
    >
      {initials}
    </span>
  );
}
