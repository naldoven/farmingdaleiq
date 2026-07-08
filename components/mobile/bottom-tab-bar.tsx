"use client";

import * as React from "react";
import Link from "next/link";
import { ClipboardList, Home, Users, Menu as MenuIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PRIMARY_TABS, type PrimaryTabId } from "@/lib/nav/page-map";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  users: Users,
  tasks: ClipboardList,
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
        className="h-7 w-7"
        strokeWidth={active ? 2.4 : 2}
        aria-hidden="true"
      />
      <span className="text-xs font-semibold">{label}</span>
    </>
  );
  const cls = cn(
    "flex flex-1 flex-col items-center justify-center gap-1 py-3 min-h-[64px] transition-colors",
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
  className?: string;
}

/** Which primary tab owns a given pathname, or null if none does. */
function activeTabFor(pathname: string): PrimaryTabId | null {
  if (pathname === "/") return "home";
  if (pathname === "/team" || pathname.startsWith("/team/")) return "team";
  if (pathname === "/tasks" || pathname.startsWith("/tasks/")) return "tasks";
  if (pathname === "/menu" || pathname.startsWith("/menu/")) return "menu";
  return null;
}

/**
 * Fixed bottom tab bar for phones: Home / Team / Tasks / Menu. White bar with a
 * top hairline and safe-area padding, tall tap targets. The active destination
 * is accent red, others are gray. Every tab navigates to its route.
 */
export function BottomTabBar({ pathname, className }: BottomTabBarProps) {
  const activeTab = activeTabFor(pathname);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card pb-safe md:hidden",
        className,
      )}
    >
      <div className="flex items-stretch">
        {PRIMARY_TABS.map((tab) => (
          <TabItem
            key={tab.id}
            icon={ICONS[tab.icon]}
            label={tab.label}
            active={activeTab === tab.id}
            href={tab.href}
          />
        ))}
      </div>
    </nav>
  );
}
