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
    { href: "/guest-recovery/reporting", label: "Stats" },
  ],
  setup: [
    { href: "/guest-recovery/menu", label: "Menu items" },
    { href: "/guest-recovery/menu/settings", label: "Settings" },
  ],
} satisfies Record<string, Tab[]>;

/**
 * The tabs under two of the Guest Recovery rows in the menu: Recoveries holds
 * Current and Stats; Menu & settings holds the item list and the settings. Log
 * and Scan are rows of their own. Real links (not a client-side switch) so each
 * tab keeps its own URL and permission check. Stats is for managers, so a
 * leader who cannot see it gets no tab row at all (one tab is not a choice).
 */
export function GuestRecoveryTabs({
  group,
  showStats = true,
}: {
  group: keyof typeof GROUPS;
  showStats?: boolean;
}) {
  const pathname = usePathname();
  const tabs: Tab[] = GROUPS[group].filter((tab) => showStats || tab.label !== "Stats");
  if (tabs.length < 2) return null;

  return (
    <nav aria-label="Guest Recovery sections">
      <ChipRow>
        {tabs.map((tab) => {
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
