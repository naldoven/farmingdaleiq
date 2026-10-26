import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildTodayView,
  missingSourceIds,
  progressText,
  visibleAssignments,
  type SourceInfo,
} from "@/app/(app)/cleaning/today-view";
import {
  canPlanCleaning,
  loadItems,
  loadStoreClock,
  loadWeek,
  loadWeekAssignments,
  loadZones,
  signPhotoUrls,
} from "@/app/(app)/cleaning/queries";
import { boardWeekStart } from "@/app/(app)/cleaning/week-logic";
import { BuildWeekButton } from "@/components/cleaning/today-build-button";
import { TodaySection } from "@/components/cleaning/today-card";
import { TodayLater } from "@/components/cleaning/today-later";
import { PermissionError, hasPermission } from "@/lib/auth/permissions";
import type { Database } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

type Client = SupabaseClient<Database>;

/**
 * /cleaning, the Today screen (docs/CLEANING-PLAN.md "Screens"): this shift's
 * AM and PM lists, carry-over and redo tags, and tap-to-photo-complete. On a
 * Sunday the store is closed, so it previews Monday read only.
 *
 * Readers hold cleaning.complete or plan rights (the coordinator tag counts),
 * the same test the completion route and the table RLS apply, so a plain
 * requirePermission would lock out a coordinator who lacks the key.
 *
 * "Today" is the store-local date, never the server clock (loadStoreClock).
 */
export const metadata = { title: "Cleaning" };

/** The clean a carry-over or redo came from, for its tag. One query. */
async function loadSourceRows(supabase: Client, ids: string[]): Promise<Map<string, SourceInfo>> {
  const found = new Map<string, SourceInfo>();
  if (ids.length === 0) return found;
  const { data, error } = await supabase.from("cleaning_assignments").select("id, date, reject_note").in("id", ids);
  if (error) throw new Error(`Could not load the earlier cleans: ${error.message}`);
  for (const row of data ?? []) found.set(row.id, { date: row.date, reject_note: row.reject_note });
  return found;
}

/** Profile id to name, for "Done by Maria". A name that fails to load just drops the name. */
async function loadNames(supabase: Client, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const { data } = await supabase.from("profiles").select("id, name").in("id", ids);
  for (const row of data ?? []) names.set(row.id, row.name);
  return names;
}

export default async function CleaningTodayPage() {
  const supabase = await createClient();
  const [canComplete, canPlan] = await Promise.all([
    hasPermission("cleaning.complete"),
    canPlanCleaning(supabase),
  ]);
  if (!canComplete && !canPlan) {
    // Same outcome as requirePermission: the (app) error boundary renders the
    // friendly "couldn't open this page" screen.
    throw new PermissionError("cleaning.complete");
  }

  const { today } = await loadStoreClock(supabase);
  const weekStart = boardWeekStart(today);
  const [week, assignments, zones, items] = await Promise.all([
    loadWeek(supabase, weekStart),
    loadWeekAssignments(supabase, weekStart),
    loadZones(supabase),
    // Retired items too: a clean already on the board keeps its name.
    loadItems(supabase, ["draft", "active", "retired"]),
  ]);

  const shown = visibleAssignments(today, assignments);
  const completerIds = [...new Set(shown.map((row) => row.completed_by).filter((id): id is string => Boolean(id)))];
  const photoPaths = shown.map((row) => row.photo_path).filter((path): path is string => Boolean(path));
  const [earlier, people, photoUrls] = await Promise.all([
    loadSourceRows(supabase, missingSourceIds(shown, assignments)),
    loadNames(supabase, completerIds),
    // One batched call for the whole page; per-photo signing dropped results
    // under load in the Quote Tool (see signPhotoUrls).
    signPhotoUrls(supabase, photoPaths),
  ]);

  const sources = new Map<string, SourceInfo>(earlier);
  for (const row of assignments) sources.set(row.id, { date: row.date, reject_note: row.reject_note });

  const view = buildTodayView({
    today,
    assignments,
    items: new Map(items.map((item) => [item.id, item])),
    zones: new Map(zones.map((zone) => [zone.id, zone])),
    people,
    photoUrls,
    sources,
    canPlan,
  });

  // Carry-overs and redos can land in a week the Thursday build has not made
  // yet, so a week row alone does not mean the board exists.
  const built = Boolean(week?.built_at);
  const interactive = !view.closed;
  const hasRows = view.am.length + view.pm.length + view.laterCount > 0;
  const progress = progressText([...view.am, ...view.pm]);
  const summary = view.closed ? "Closed today" : progress || (built ? "Nothing planned today" : "");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-[30px] font-bold leading-tight text-ink">{view.dateLabel}</h1>
        {summary ? <p className="text-[15px] text-muted-ink">{summary}</p> : null}
      </div>

      {!built ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4 shadow-card">
          <p className="text-[15px] text-ink">
            {view.closed ? "Next week" : "This week"} has not been built yet. The plan appears here once it is.
          </p>
          {canPlan ? (
            <BuildWeekButton weekStart={weekStart} label={view.closed ? "Build next week" : "Build this week"} />
          ) : (
            <p className="text-[14px] text-muted-ink">Ask the cleaning coordinator to build it.</p>
          )}
        </div>
      ) : null}

      {view.closed && (built || hasRows) ? (
        <h2 className="text-[19px] font-semibold text-ink">
          Coming up: <span className="text-muted-ink">{view.focusLabel}</span>
        </h2>
      ) : null}

      {built || hasRows ? (
        <>
          <TodaySection title="AM" cards={view.am} interactive={interactive} />
          <TodaySection title="PM" cards={view.pm} interactive={interactive} />
          <TodayLater groups={view.later} count={view.laterCount} />
        </>
      ) : null}
    </div>
  );
}
