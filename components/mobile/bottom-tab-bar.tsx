"use client";

import * as React from "react";
import Link from "next/link";
import { Home, Users, Menu as MenuIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PRIMARY_TABS, type PrimaryTabId } from "@/lib/nav/page-map";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  users: Users,
  menu: MenuIcon,
};

export interface TabItemProps {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  href?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
}

/** One bottom-bar destination: icon over label, active in accent red. */
export function TabItem({ icon: Icon, label, active, href, onClick }: TabItemProps) {
  const body = (
    <>
      <Icon
        className="h-6 w-6"
        strokeWidth={active ? 2.4 : 2}
        aria-hidden="true"
      />
      <span className="text-[11px] font-semibold">{label}</span>
    </>
  );
  const cls = cn(
    "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-colors",
    active ? "text-accent" : "text-[#94A3B8]",
  );

  if (href) {
    return (
      <Link href={href} className={cls} aria-current={active ? "page" : undefined}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} aria-current={active ? "page" : undefined}>
      {body}
    </button>
  );
}

export interface BottomTabBarProps {
  /** Current pathname, used to mark the active tab. */
  pathname: string;
  /** Called when the Menu tab is pressed (opens the full nav drawer). */
  onMenuClick: () => void;
  /** Whether the Menu drawer is currently open (marks Menu active). */
  menuOpen?: boolean;
  className?: string;
}

/**
 * Fixed bottom tab bar for phones: Home / Team / Menu. White bar with a top
 * hairline and safe-area padding. The active destination is accent red, others
 * are gray. Menu is a button that opens the full navigation drawer.
 */
export function BottomTabBar({
  pathname,
  onMenuClick,
  menuOpen = false,
  className,
}: BottomTabBarProps) {
  const activeTab: PrimaryTabId | null = menuOpen
    ? "menu"
    : pathname === "/"
      ? "home"
      : pathname === "/team" || pathname.startsWith("/team/")
        ? "team"
        : null;

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card pb-safe md:hidden",
        className,
      )}
    >
      <div className="flex items-stretch">
        {PRIMARY_TABS.map((tab) => {
          const Icon = ICONS[tab.icon];
          const active = activeTab === tab.id;
          if (tab.href) {
            return (
              <TabItem
                key={tab.id}
                icon={Icon}
                label={tab.label}
                active={active}
                href={tab.href}
              />
            );
          }
          return (
            <TabItem
              key={tab.id}
              icon={Icon}
              label={tab.label}
              active={active}
              onClick={onMenuClick}
            />
          );
        })}
      </div>
    </nav>
  );
}
