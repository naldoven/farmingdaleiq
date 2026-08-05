"use client";

import * as React from "react";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { AvatarInitials } from "@/components/mobile/avatar-initials";
import { Wordmark } from "@/components/mobile/app-header";
import { NavLinks } from "@/components/shell/nav-links";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { setNavCollapsed, useNavPrefs } from "@/lib/nav/nav-prefs";
import { cn } from "@/lib/utils";

export interface SidebarUser {
  name: string;
  roleName: string | null;
}

/**
 * Desktop left sidebar (md+). Light card surface, wordmark header, grouped
 * NavLinks (active in accent red), and a user footer. Hidden on phones, where
 * the bottom tab bar + Menu drawer take over.
 *
 * Collapsible: the header toggle shrinks it to a 4.5rem icon rail and back, and
 * the choice persists per browser (lib/nav/nav-prefs). Collapsed, the footer
 * drops to just the avatar so the rail stays narrow. The nav itself decides how
 * to render each state — see NavLinks.
 *
 * `allowedPermissions` is threaded down to NavLinks so gated items the user
 * can't reach are hidden (S4 dead-end fix).
 */
export function Sidebar({
  user,
  allowedPermissions,
}: {
  user: SidebarUser;
  allowedPermissions?: readonly string[];
}) {
  const { collapsed } = useNavPrefs();

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-line bg-card transition-[width] duration-200 md:flex",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-line",
          collapsed ? "justify-center px-2" : "gap-2 px-5",
        )}
      >
        {!collapsed && (
          <Link href="/" aria-label="FarmingdaleIQ home" className="min-w-0 flex-1">
            <Wordmark />
          </Link>
        )}
        <button
          type="button"
          onClick={() => setNavCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          title={collapsed ? "Expand menu" : "Collapse menu"}
          aria-expanded={!collapsed}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-ink transition-colors hover:bg-secondary hover:text-ink"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className={cn("flex-1 overflow-y-auto", collapsed ? "p-2" : "p-3")}>
        <NavLinks allowedPermissions={allowedPermissions} collapsed={collapsed} />
      </div>

      <div className={cn("border-t border-line", collapsed ? "p-2" : "p-3")}>
        {collapsed ? (
          <Link
            href="/people"
            title={user.name}
            aria-label={`${user.name} — my profile`}
            className="flex justify-center rounded-lg py-1 transition-colors hover:bg-secondary"
          >
            <AvatarInitials name={user.name || "?"} size="md" />
          </Link>
        ) : (
          <>
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
          </>
        )}
      </div>
    </aside>
  );
}
