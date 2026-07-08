import * as React from "react";
import Link from "next/link";

import { AvatarInitials } from "@/components/mobile/avatar-initials";
import { Wordmark } from "@/components/mobile/app-header";
import { NavLinks } from "@/components/shell/nav-links";
import { SignOutButton } from "@/components/shell/sign-out-button";

export interface SidebarUser {
  name: string;
  roleName: string | null;
}

/**
 * Desktop left sidebar (md+). Light card surface, wordmark header, grouped
 * NavLinks (active in accent red), and a user footer. Hidden on phones, where
 * the bottom tab bar + Menu drawer take over.
 */
export function Sidebar({ user }: { user: SidebarUser }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-card md:flex">
      <div className="flex h-16 items-center border-b border-line px-5">
        <Link href="/" aria-label="FarmingdaleIQ home">
          <Wordmark />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <NavLinks />
      </div>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 px-1">
          <AvatarInitials name={user.name || "?"} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
            <p className="truncate text-xs text-muted-ink">
              {user.roleName ?? "No role"}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Link
            href="/notifications"
            className="flex-1 rounded-lg border border-line px-2 py-1.5 text-center text-xs font-medium text-ink hover:bg-secondary"
          >
            Notifications
          </Link>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
