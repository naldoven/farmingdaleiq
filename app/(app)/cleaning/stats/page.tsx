import type { SupabaseClient } from "@supabase/supabase-js";

import type { ItemKind } from "@/app/(app)/cleaning/constants";
import {
  loadAssignmentsBetween,
  loadCarriesAfter,
  loadItems,
  loadLastDone,
  loadSetupOwners,
  loadStoreClock,
  loadZones,
} from "@/app/(app)/cleaning/queries";
import { leaderStats, monthLabel, mostOverdue, trendPoints, zoneStats, type TrendPoint } from "@/app/(app)/cleaning/stats";
import {
  areaRows,
  emptyMonthText,
  leaderIds,
  leaderRows,
  monthChips,
  overdueRows,
  parseMonthParam,
  rangeNote,
  scoredRange,
  toStatRows,
  trendBars,
  unownedView,
} from "@/app/(app)/cleaning/stats-view";
import { StatsAreas } from "@/components/cleaning/stats-areas";
import { StatsLeaders } from "@/components/cleaning/stats-leaders";
import { StatsMonthNav } from "@/components/cleaning/stats-month-nav";
import { StatsOverdue } from "@/components/cleaning/stats-overdue";
import { StatsTrend } from "@/components/cleaning/stats-trend";
import { SectionCard } from "@/components/mobile";
import { requirePermission } from "@/lib/auth/permissions";
import type { Database } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

type Client = SupabaseClient<Database>;

/**
 * /cleaning/stats (docs/CLEANING-PLAN.md "Decisions": Metrics). Leaders only:
 * the store trend, shift-leader on-time and misses for a month, completion by
 * area and the most overdue rotating cleans. Team members get only the store
 * trend, as a number on Home, through a function that returns counts and no
 * names.
 *
 * The page needs cleaning.view_reports itself. The assignments table is
 * already limited to leaders and planners by RLS, but this key is the one the
 * plan names for metrics, and a coordinator tag alone should not open
 * per-person numbers.
 */
export const metadata = { title: "Cleaning stats" };

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The twelve-week trend. A failure shows a note inside its own card rather
 * than taking the leaders' numbers down with it.
 */
async function loadTrend(supabase: Client): Promise<{ points: TrendPoint[]; failed: boolean }> {
  try {
    const { data, error } = await supabase.rpc("cleaning_store_trend", { p_weeks: 12 });
    if (error) throw new Error(error.message);
    return { points: trendPoints(data ?? []), failed: false };
  } catch (error) {
    console.error("cleaning stats: could not load the store trend", error);
    return { points: [], failed: true };
  }
}

/** Profile id to name. A name that fails to load shows as "Former team member" in leaderStats. */
async function loadNames(supabase: Client, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const { data } = await supabase.from("profiles").select("id, name").in("id", ids);
  for (const row of data ?? []) names.set(row.id, row.name);
  return names;
}

export default async function CleaningStatsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePermission("cleaning.view_reports");

  const supabase = await createClient();
  const params = await searchParams;
  const clock = await loadStoreClock(supabase);
  const month = parseMonthParam(first(params.month), clock.today);
  // Null when nothing in the month has closed yet; no query is made for it.
  const range = scoredRange(month, clock.today);

  const [trend, zones, items, lastDone, assignmentRows, setupOwners, laterCarries] = await Promise.all([
    loadTrend(supabase),
    loadZones(supabase),
    // Every status: a retired item can still own cleans from earlier in the month.
    loadItems(supabase, ["draft", "active", "retired"]),
    loadLastDone(supabase, clock.timeZone),
    range ? loadAssignmentsBetween(supabase, range.from, range.to) : Promise.resolve([]),
    range ? loadSetupOwners(supabase, range.from, range.to) : Promise.resolve(new Map<string, string>()),
    range ? loadCarriesAfter(supabase, range.to) : Promise.resolve([]),
  ]);

  const rows = toStatRows(assignmentRows);
  const names = await loadNames(supabase, leaderIds(rows, setupOwners));
  const { leaders, unowned } = leaderStats(rows, setupOwners, names, clock.timeZone, laterCarries);

  // Hidden areas (FOH until it launches) stay out of every area figure.
  const activeZones = zones.filter((zone) => zone.active);
  const areas = areaRows(
    zoneStats(rows, new Map(items.map((item) => [item.id, item.zone_id])), activeZones, clock.timeZone),
  );

  const zoneNames = new Map(activeZones.map((zone) => [zone.id, zone.name]));
  const overdue = overdueRows(
    mostOverdue(
      items
        .filter((item) => item.status === "active" && zoneNames.has(item.zone_id))
        .map((item) => ({
          id: item.id,
          name: item.name,
          zoneName: zoneNames.get(item.zone_id)!,
          kind: item.kind as ItemKind,
          interval_weeks: item.interval_weeks,
          start_on: item.start_on,
        })),
      lastDone,
      clock.today,
      10,
    ),
  );

  const unownedRow = unownedView(unowned);
  const monthIsEmpty = leaders.length === 0 && !unownedRow && areas.length === 0;
  const note = rangeNote(month, clock.today);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[30px] font-bold leading-tight text-ink">Cleaning stats</h1>
        <p className="text-[15px] text-muted-ink">Leaders only. A clean is on time when it is done on or before its day.</p>
      </div>

      <StatsTrend bars={trendBars(trend.points)} failed={trend.failed} />

      <div className="flex flex-col gap-2">
        <h2 className="text-[19px] font-semibold text-ink">{monthLabel(month)}</h2>
        <StatsMonthNav chips={monthChips(clock.today, month)} />
        {note ? <p className="text-[13px] text-muted-ink">{note}</p> : null}
      </div>

      {monthIsEmpty ? (
        <SectionCard>
          <p className="text-[15px] text-muted-ink">{emptyMonthText(month, clock.today)}</p>
        </SectionCard>
      ) : (
        <>
          <StatsLeaders leaders={leaderRows(leaders)} unowned={unownedRow} />
          <StatsAreas areas={areas} />
        </>
      )}

      <StatsOverdue rows={overdue} />
    </div>
  );
}
