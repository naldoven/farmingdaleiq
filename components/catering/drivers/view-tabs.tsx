import Link from "next/link";

import type { DriverView } from "@/app/(app)/catering/drivers/validation";
import { ChipRow } from "@/components/mobile";
import { cn } from "@/lib/utils";

/**
 * Today / Tomorrow / This week / Roster. Real links rather than FilterChip
 * buttons: each tab is a server-rendered page of its own, so a link prefetches
 * and survives a refresh. Same pill look as FilterChip, but 44px tall because
 * these are the main controls on the page.
 */
export function DriverViewTabs({ view, tomorrowLabel }: { view: DriverView; tomorrowLabel: string }) {
  const tabs: { view: DriverView; label: string; href: string }[] = [
    { view: "today", label: "Today", href: "/catering/drivers" },
    { view: "tomorrow", label: tomorrowLabel, href: "/catering/drivers?view=tomorrow" },
    { view: "week", label: "This week", href: "/catering/drivers?view=week" },
    { view: "roster", label: "Roster", href: "/catering/drivers?view=roster" },
  ];

  return (
    <nav aria-label="Driver views">
      <ChipRow>
        {tabs.map((tab) => {
          const current = tab.view === view;
          return (
            <Link
              key={tab.view}
              href={tab.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[14px] font-semibold transition-colors",
                current
                  ? "border-ink bg-ink text-white"
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
