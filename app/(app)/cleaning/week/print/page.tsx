import Link from "next/link";

import {
  buildWeekView,
  toBoardAssignments,
  weekRangeLabel,
  type BoardCard,
} from "@/app/(app)/cleaning/board-view";
import {
  canPlanCleaning,
  loadItems,
  loadStoreClock,
  loadWeekAssignments,
  loadZones,
} from "@/app/(app)/cleaning/queries";
import { weekStartSchema } from "@/app/(app)/cleaning/validation";
import { boardWeekStart } from "@/app/(app)/cleaning/week-logic";
import { PrintButton } from "@/components/cleaning/print-button";
import { PrintSheet } from "@/components/cleaning/print-sheet";
import { PermissionError, hasPermission } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

/**
 * /cleaning/week/print (docs/CLEANING-PLAN.md "Print"): the week in the
 * paper sheet's layout. BOH and FOH print separately (?side=boh|foh). Same
 * readers as the board.
 *
 * The app shell (sidebar, header, tab bar) has no print rules of its own, so
 * this page switches those off while printing with the style block below.
 * They are the shell's aside, header and nav elements; the printed sheet
 * itself uses none of them. A site-wide print rule in the shell would be
 * cleaner, but the shell is shared, so the page carries its own.
 */
export const metadata = { title: "Weekly Cleaning Schedule" };

const PRINT_CSS = `
@page { size: landscape; margin: 0.4in; }
.print-exact { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media print {
  aside, header, nav { display: none !important; }
  main { padding: 0 !important; }
  .bg-canvas { background: #fff !important; }
}
`;

const SIDES = [
  { value: "boh", label: "Back of house" },
  { value: "foh", label: "Front of house" },
] as const;

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CleaningWeekPrintPage({ searchParams }: { searchParams: Promise<Params> }) {
  const supabase = await createClient();
  const [canComplete, canPlan] = await Promise.all([hasPermission("cleaning.complete"), canPlanCleaning(supabase)]);
  if (!canComplete && !canPlan) throw new PermissionError("cleaning.complete");

  const params = await searchParams;
  const clock = await loadStoreClock(supabase);
  const parsedWeek = weekStartSchema.safeParse({ weekStart: first(params.week) });
  const weekStart = parsedWeek.success ? parsedWeek.data.weekStart : boardWeekStart(clock.today);
  const side = first(params.side) === "foh" ? "foh" : "boh";
  const sideLabel = SIDES.find((s) => s.value === side)!.label;

  const [assignmentRows, zones, items] = await Promise.all([
    loadWeekAssignments(supabase, weekStart),
    loadZones(supabase),
    loadItems(supabase, ["draft", "active", "retired"]),
  ]);

  // A skipped clean is a deferral, so it stays off the paper sheet.
  const days = buildWeekView({
    weekStart,
    assignments: toBoardAssignments(assignmentRows),
    items,
    zones,
    caps: {},
    include: (card: BoardCard) => card.zoneSide === side && card.status !== "skipped",
  });
  const printed = days.flatMap((d) => [...d.am.cards, ...d.pm.cards]);
  const legendIds = new Set(printed.map((c) => c.zoneId));
  const legend = zones.filter((z) => legendIds.has(z.id)).map((z) => ({ id: z.id, name: z.name, color: z.color }));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 print:max-w-none">
      <style>{PRINT_CSS}</style>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link
          href={`/cleaning/week?week=${weekStart}`}
          className="inline-flex min-h-11 items-center rounded-full border border-line bg-card px-4 text-[14px] font-semibold text-muted-ink hover:bg-secondary"
        >
          Back to the board
        </Link>
        <div role="group" aria-label="Side of the store" className="flex gap-2">
          {SIDES.map((option) => (
            <Link
              key={option.value}
              href={`/cleaning/week/print?week=${weekStart}&side=${option.value}`}
              aria-current={option.value === side ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-4 text-[14px] font-semibold transition-colors",
                option.value === side
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-card text-muted-ink hover:bg-secondary",
              )}
            >
              {option.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto">
          <PrintButton />
        </div>
      </div>

      {printed.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card p-6 text-center text-[15px] text-muted-ink shadow-card">
          Nothing is planned for {sideLabel.toLowerCase()} the week of {weekRangeLabel(weekStart)}. A week that has
          not been built yet prints empty; build it on the board first.
        </p>
      ) : (
        <PrintSheet
          rangeLabel={weekRangeLabel(weekStart, { year: true })}
          sideLabel={sideLabel}
          days={days}
          legend={legend}
        />
      )}
    </div>
  );
}
