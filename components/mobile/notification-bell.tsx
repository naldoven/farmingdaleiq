import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import { cn } from "@/lib/utils";

export interface NotificationBellProps {
  /** Show the unread dot. */
  hasUnread?: boolean;
  /** Route the bell links to. Defaults to the notification center. */
  href?: string;
  className?: string;
}

/**
 * Icon-only notification control with an unread dot. Renders as a link to the
 * notification center. The dot is decorative; the unread state is announced
 * through the aria-label so it is not color-only information.
 */
export function NotificationBell({
  hasUnread = false,
  href = "/notifications",
  className,
}: NotificationBellProps) {
  return (
    <Link
      href={href}
      aria-label={hasUnread ? "Notifications, unread" : "Notifications"}
      className={cn(
        "relative inline-flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-secondary",
        className,
      )}
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {hasUnread && (
        <span
          aria-hidden="true"
          className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent ring-2 ring-card"
        />
      )}
    </Link>
  );
}
