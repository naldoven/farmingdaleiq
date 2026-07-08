"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_GROUPS } from "@/lib/nav/page-map";
import { cn } from "@/lib/utils";

/**
 * Grouped navigation list shared by the desktop sidebar and the mobile "Menu"
 * drawer. Light surface, navy text, uppercase group labels; the active route is
 * highlighted in the accent red (soft fill + red text). A route counts as
 * active on exact match or when the current path is nested under it (but "/"
 * only matches exactly, so it does not light up on every page).
 */
export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <span className="px-3 text-[11px] font-bold uppercase tracking-wider text-muted-ink">
            {group.label}
          </span>
          {group.items.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href ||
                  pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-xl px-3 py-2 text-[15px] font-medium transition-colors",
                  active
                    ? "bg-accent-soft font-semibold text-accent-ink"
                    : "text-ink hover:bg-secondary",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
