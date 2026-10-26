import Link from "next/link";
import { Printer, Settings } from "lucide-react";

import {
  buildPullItems,
  buildWeekView,
  openingWeekday,
  parseDayParam,
  toBoardAssignments,
  toExistingAssignments,
  trayRows,
  weekRangeLabel,
  weekToggleStarts,
} from "@/app/(app)/cleaning/board-view";
import {
  canPlanCleaning,
  loadItems,
  loadLastDone,
  loadSlotCaps,
  loadStoreClock,
  loadWeek,
  loadWeekAssignments,
  loadZones,
} from "@/app/(app)/cleaning/queries";
import { weekStartSchema } from "@/app/(app)/cleaning/validation";
import { loadPlanItems } from "@/app/(app)/cleaning/week-build";
import { addDays, boardWeekStart, dueNotPlaced } from "@/app/(app)/cleaning/week-logic";
import { WeekBoard } from "@/components/cleaning/week-board";
import { WeekBuildButton } from "@/components/cleaning/week-build-button";
import { WeekNav } from "@/components/cleaning/week-nav";
import { Button } from "@/components/ui/button";
import { PermissionError, hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /cleaning/week (docs/CLEANING-PLAN.md "Screens" and "How a week runs"):
 * one day at a time, AM and PM sections, constants on top. Planners move,
 * skip, remove and pull items in; leaders read the same board.
 *
 * Readers hold cleaning.complete or plan rights (the coordinator tag counts),
 * the same test the other cleaning pages and the table RLS apply.
 */
export const metadata = { title: "Cleaning week" };

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CleaningWeekPage({ searchParams }: { searchParams: Promise<Params> }) {
  const supabase = await createClient();
  const [canComplete, canPlan] = await Promise.all([hasPermission("cleaning.complete"), canPlanCleaning(supabase)]);
  if (!canComplete && !canPlan) throw new PermissionError("cleaning.complete");

  const params = await searchParams;
  const clock = await loadStoreClock(supabase);
  const { thisWeek, nextWeek } = weekToggleStarts(boardWeekStart(clock.today));

  // A bad or missing ?week falls back to this week rather than an error page.
  const parsedWeek = weekStartSchema.safeParse({ weekStart: first(params.week) });
  const weekStart = parsedWeek.success ? parsedWeek.data.weekStart : thisWeek;
  const initialWeekday = openingWeekday(weekStart, clock.today, parseDayParam(first(params.day)));

  const [week, assignmentRows, zones, items, caps, planItems, lastDone] = await Promise.all([
    loadWeek(supabase, weekStart),
    loadWeekAssignments(supabase, weekStart),
    loadZones(supabase),
    // Every status: a retired item can still sit on a week that was built before it retired.
    loadItems(supabase, ["draft", "active", "retired"]),
    loadSlotCaps(supabase),
    loadPlanItems(supabase),
    loadLastDone(supabase, clock.timeZone),
  ]);

  const built = Boolean(week?.built_at);
  const notBuilt = !built && assignmentRows.length === 0;
  const canBuild = canPlan && addDays(weekStart, 5) >= clock.today;

  const assignments = toBoardAssignments(assignmentRows);
  const days = buildWeekView({
    weekStart,
    assignments,
    items,
    zones,
    caps: Object.fromEntries(caps),
  });

  // The tray reads "due, not placed" against a finished build. Before it, every
  // due item would show, which says nothing the build is about to fix.
  const trayIds = built
    ? dueNotPlaced({
        weekStart,
        items: planItems,
        lastDone,
        existing: toExistingAssignments(assignments, items),
      })
    : [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[30px] font-bold leading-tight text-ink">Cleaning week</h1>
        <p className="text-[15px] text-muted-ink">{weekRangeLabel(weekStart)}</p>
      </div>

      <WeekNav thisWeek={thisWeek} nextWeek={nextWeek} current={weekStart} />

      {canPlan ? (
        <div className="flex gap-2">
          <Button asChild variant="outline" className="h-11 flex-1 rounded-lg text-[15px]">
            <Link href={`/cleaning/week/print?week=${weekStart}&side=boh`}>
              <Printer className="size-4" aria-hidden="true" />
              Print
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 flex-1 rounded-lg text-[15px]">
            <Link href="/cleaning/settings">
              <Settings className="size-4" aria-hidden="true" />
              Settings
            </Link>
          </Button>
        </div>
      ) : null}

      {notBuilt ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5 shadow-card">
          <h2 className="text-[19px] font-semibold text-ink">This week is not built yet</h2>
          <p className="text-[15px] text-muted-ink">
            The app builds next week&apos;s plan on its own from Thursday at 8 pm.
            {canBuild
              ? " Tap Build now to place this week's cleans sooner."
              : canPlan
                ? " This week is over, so there is nothing to build."
                : " A planner can build it sooner."}
          </p>
          {canBuild ? <WeekBuildButton weekStart={weekStart} /> : null}
        </div>
      ) : (
        <>
          {!built ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-line bg-warning-soft p-4">
              <p className="text-[14px] text-ink">
                Only the cleans added by hand are here. The app places the rest when it builds the week, Thursday at 8
                pm for next week.
              </p>
              {canBuild ? <WeekBuildButton weekStart={weekStart} /> : null}
            </div>
          ) : null}
          <WeekBoard
            // A fresh board per week, so the open day never carries over from the other week.
            key={weekStart}
            weekStart={weekStart}
            today={clock.today}
            initialWeekday={initialWeekday}
            canPlan={canPlan}
            days={days}
            tray={trayRows(trayIds, items, zones)}
            pullItems={canPlan ? buildPullItems(planItems, items, zones) : []}
            onBoardItemIds={[...new Set(assignments.map((a) => a.item_id))]}
          />
        </>
      )}
    </div>
  );
}
