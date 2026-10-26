import Link from "next/link";

import type { MonthChip } from "@/app/(app)/cleaning/stats-view";
import { ChipRow } from "@/components/mobile";
import { cn } from "@/lib/utils";

/**
 * Month picker for the leaders and areas cards. Plain links, so the server
 * loads the chosen month and a shared link opens the same view. Styled like
 * the design system's FilterChip, which is a button and cannot be a link.
 */
export function StatsMonthNav({ chips }: { chips: MonthChip[] }) {
  return (
    <nav aria-label="Month">
      <ChipRow>
        {chips.map((chip) => (
          <Link
            key={chip.month}
            href={chip.href}
            aria-current={chip.active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border px-4 text-[14px] font-semibold transition-colors",
              chip.active ? "border-ink bg-ink text-white" : "border-line bg-card text-muted-ink hover:bg-secondary",
            )}
          >
            {chip.label}
          </Link>
        ))}
      </ChipRow>
    </nav>
  );
}
