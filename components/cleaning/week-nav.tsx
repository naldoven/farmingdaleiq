import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * "This week" / "Next week" toggle. Plain links, so the server loads the
 * chosen week and a shared link opens the same board. Styled like the design
 * system's FilterChip, which is a button and cannot be a link.
 */
export function WeekNav({
  thisWeek,
  nextWeek,
  current,
}: {
  thisWeek: string;
  nextWeek: string;
  current: string;
}) {
  const options = [
    { label: "This week", weekStart: thisWeek },
    { label: "Next week", weekStart: nextWeek },
  ];
  return (
    <div role="group" aria-label="Week" className="flex gap-2">
      {options.map((option) => {
        const active = option.weekStart === current;
        return (
          <Link
            key={option.weekStart}
            href={`/cleaning/week?week=${option.weekStart}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 flex-1 items-center justify-center rounded-full border px-4 text-[14px] font-semibold transition-colors",
              active ? "border-ink bg-ink text-white" : "border-line bg-card text-muted-ink hover:bg-secondary",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
