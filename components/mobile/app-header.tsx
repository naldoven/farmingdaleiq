import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { AvatarInitials } from "@/components/mobile/avatar-initials";
import { NotificationBell } from "@/components/mobile/notification-bell";
import { StoreLocationPill } from "@/components/mobile/store-location-pill";

/** FarmingdaleIQ wordmark: "IQ" in the accent for a bit of character. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[19px] font-extrabold tracking-tight text-ink", className)}>
      Farmingdale<span className="text-accent">IQ</span>
    </span>
  );
}

export interface AppHeaderProps {
  variant: "home" | "subpage";
  /** Sub-page title (large, bold). */
  title?: string;
  /** Back destination for the sub-page chevron. */
  backHref?: string;
  /** Whether to show the back chevron. Primary-tab screens set this false. */
  showBack?: boolean;
  /** Right-side actions on a sub-page (gear, +, overflow). */
  actions?: React.ReactNode;
  /** Home-variant user identity for the avatar. */
  userName?: string;
  storeName?: string;
  storeAddress?: string;
  hasUnread?: boolean;
  className?: string;
}

/**
 * The mobile top header. Two shapes:
 *  - "home": wordmark, store-location pill, notification bell, and avatar.
 *  - "subpage": a back chevron with a large bold title, plus optional right
 *    actions.
 * Sticky to the top of the scroll area; sits above the page content.
 */
export function AppHeader({
  variant,
  title,
  backHref = "/",
  showBack = true,
  actions,
  userName = "",
  storeName,
  storeAddress,
  hasUnread = false,
  className,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-line bg-card/95 px-4 py-2 backdrop-blur md:hidden",
        className,
      )}
    >
      {variant === "home" ? (
        <>
          <Link href="/" aria-label="FarmingdaleIQ home" className="shrink-0">
            <Wordmark />
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            {storeName && storeAddress && (
              <StoreLocationPill
                storeName={storeName}
                address={storeAddress}
                className="max-w-[44vw]"
              />
            )}
            <NotificationBell hasUnread={hasUnread} />
            {userName && (
              <Link href="/people" aria-label="My profile">
                <AvatarInitials name={userName} size="sm" />
              </Link>
            )}
          </div>
        </>
      ) : (
        <>
          {showBack && (
            <Link
              href={backHref}
              aria-label="Back"
              className="-ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-secondary"
            >
              <ChevronLeft className="h-6 w-6" aria-hidden="true" />
            </Link>
          )}
          <h1
            className={cn(
              "min-w-0 flex-1 truncate text-[26px] font-bold text-ink",
              !showBack && "pl-1",
            )}
          >
            {title}
          </h1>
          {actions && (
            <div className="flex shrink-0 items-center gap-1">{actions}</div>
          )}
        </>
      )}
    </header>
  );
}
