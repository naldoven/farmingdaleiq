import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";
import type { ItemKind } from "@/app/(app)/cleaning/constants";
import { loadLastDone, loadSlotCaps, loadWeekAssignments } from "@/app/(app)/cleaning/queries";
import {
  addDays,
  planWeek,
  type AssignmentStatus,
  type PlanItem,
  type SlotHalf,
} from "@/app/(app)/cleaning/week-logic";

type Client = SupabaseClient<Database>;

/** A claim older than this is a crashed build, and the next caller may retake it. */
const STALE_CLAIM_MS = 10 * 60 * 1000;

export type BuildResult =
  | { status: "built"; placed: number; tray: number }
  | { status: "already_built" }
  | { status: "busy" }
  | { status: "past" };

/**
 * Loads the active master list (active zones only, so hidden FOH zones never
 * reach a BOH week) in the shape planWeek reads.
 */
export async function loadPlanItems(supabase: Client): Promise<PlanItem[]> {
  const [{ data: zones, error: zonesError }, { data: items, error: itemsError }] = await Promise.all([
    supabase.from("cleaning_zones").select("id").eq("active", true),
    supabase.from("cleaning_items").select("*").eq("status", "active"),
  ]);
  if (zonesError) throw new Error(`Could not load zones: ${zonesError.message}`);
  if (itemsError) throw new Error(`Could not load the master list: ${itemsError.message}`);
  const activeZones = new Set((zones ?? []).map((z) => z.id));
  return (items ?? [])
    .filter((i) => activeZones.has(i.zone_id))
    .map((i) => ({
      id: i.id,
      name: i.name,
      kind: i.kind as ItemKind,
      days_of_week: i.days_of_week,
      half: i.half as PlanItem["half"],
      interval_weeks: i.interval_weeks,
      start_on: i.start_on,
      sort: i.sort,
    }));
}

/**
 * Builds one week's board (plan "How a week runs" step 1). Called by the
 * hourly cleaning job (Thursday night for next week, and for the current week
 * if it was never built) and by a planner's "Build now" button.
 *
 * Runs at most once per week: the caller first claims the week row
 * (build_started_at), so the job and a planner tapping at the same moment
 * cannot both place variables, and built_at closes it for good. If a build
 * dies midway the claim goes stale and a retry finishes it; planWeek skips
 * anything already on the board, so the retry adds only what is missing.
 * Nothing is placed before `today`, so a mid-week build never creates cleans
 * that would instantly count as missed.
 */
export async function buildCleaningWeek(
  supabase: Client,
  { weekStart, today, timeZone }: { weekStart: string; today: string; timeZone: string },
): Promise<BuildResult> {
  if (addDays(weekStart, 5) < today) return { status: "past" };

  const { error: weekError } = await supabase
    .from("cleaning_weeks")
    .upsert({ week_start: weekStart }, { onConflict: "week_start", ignoreDuplicates: true });
  if (weekError) throw new Error(`Could not open the week: ${weekError.message}`);

  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("cleaning_weeks")
    .update({ build_started_at: new Date().toISOString() })
    .eq("week_start", weekStart)
    .is("built_at", null)
    // Quoted so PostgREST reads the timestamp's dots and colons as one value.
    .or(`build_started_at.is.null,build_started_at.lt."${staleBefore}"`)
    .select("id");
  if (claimError) throw new Error(`Could not claim the week: ${claimError.message}`);
  if (!claimed || claimed.length === 0) {
    const { data: week } = await supabase.from("cleaning_weeks").select("built_at").eq("week_start", weekStart).maybeSingle();
    return week?.built_at ? { status: "already_built" } : { status: "busy" };
  }

  const [items, caps, lastDone, existing] = await Promise.all([
    loadPlanItems(supabase),
    loadSlotCaps(supabase),
    loadLastDone(supabase, timeZone),
    loadWeekAssignments(supabase, weekStart),
  ]);

  // Kind comes from the item, including retired ones still on the board, so
  // the cap count matches what the store will actually see that day.
  const kindById = new Map(items.map((i) => [i.id, i.kind]));
  const missingKinds = existing.map((e) => e.item_id).filter((id) => !kindById.has(id));
  if (missingKinds.length > 0) {
    const { data } = await supabase.from("cleaning_items").select("id, kind").in("id", missingKinds);
    for (const row of data ?? []) kindById.set(row.id, row.kind as ItemKind);
  }

  const { inserts, tray } = planWeek({
    weekStart,
    fromDate: today > weekStart ? today : weekStart,
    items,
    caps,
    lastDone,
    existing: existing.map((e) => ({
      item_id: e.item_id,
      date: e.date,
      half: e.half as SlotHalf,
      status: e.status as AssignmentStatus,
      itemKind: kindById.get(e.item_id) ?? "constant",
    })),
  });

  if (inserts.length > 0) {
    const { error: insertError } = await supabase.from("cleaning_assignments").upsert(
      inserts.map((i) => ({ ...i, week_start: weekStart })),
      { onConflict: "item_id,date,half", ignoreDuplicates: true },
    );
    if (insertError) throw new Error(`Could not place the week's cleans: ${insertError.message}`);
  }

  const { error: doneError } = await supabase
    .from("cleaning_weeks")
    .update({ built_at: new Date().toISOString() })
    .eq("week_start", weekStart);
  if (doneError) throw new Error(`Could not finish the week: ${doneError.message}`);

  return { status: "built", placed: inserts.length, tray: tray.length };
}
