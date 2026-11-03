"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChipRow } from "@/components/mobile";
import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
}

const GROUPS = {
  recoveries: [
    { href: "/guest-recovery", label: "Current" },
    { href: "/guest-recovery/new", label: "Log" },
    { href: "/guest-recovery/scan", label: "Scan" },
  ],
  setup: [
    { href: "/guest-recovery/menu", label: "Menu items" },
    { href: "/guest-recovery/menu/settings", label: "Settings" },
  ],
} satisfies Record<string, Tab[]>;

/**
 * The tabs under the Guest Recovery rows in the menu: Recoveries holds Current,
 * Log and Scan; Menu & settings holds the item list and the settings. Real links
 * (not a client-side switch) so each tab keeps its own URL and permission check.
 */
export function GuestRecoveryTabs({ group }: { group: keyof typeof GROUPS }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Guest Recovery sections">
      <ChipRow>
        {GROUPS[group].map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[14px] font-semibold transition-colors",
                active
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-card text-muted-ink hover:bg-secondary",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </ChipRow>
    </nav>
  );
}
