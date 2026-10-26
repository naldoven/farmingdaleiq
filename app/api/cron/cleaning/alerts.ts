import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildDailySummary,
  buildMissesNotice,
  buildPlanReminder,
  buildWeekPublished,
  isPlanReminderTime,
  summaryDayFor,
  type SummaryRow,
  type WeekRow,
} from "@/app/(app)/cleaning/alerts";
import type { ItemKind } from "@/app/(app)/cleaning/constants";
import { loadLastDone, loadPlannedBefore, loadWeek, loadWeekAssignments } from "@/app/(app)/cleaning/queries";
import { loadPlanItems } from "@/app/(app)/cleaning/week-build";
import {
  addDays,
  boardWeekStart,
  dueNotPlaced,
  projectLastDone,
  type AssignmentStatus,
  type SlotHalf,
} from "@/app/(app)/cleaning/week-logic";
import type { Database } from "@/lib/db/types";
import { storeDateTimeInputToIso } from "@/lib/time";

type Client = SupabaseClient<Database>;

export type AlertResult = { status: "queued" | "skipped" | "already_sent" | "error"; error?: string };

/**
 * Earliest store time for the morning summary. The day-end close runs from
 * 3am, but the coordinator's notice fans out to web push, and a 3am buzz
 * every night someone missed a clean is the fastest way to get notifications
 * turned off. 6am is after the close and around opening.
 */
export const SUMMARY_FROM = "06:00:00";

const SUMMARY_JOB = "cleaning-daily-summary";
const REMINDER_JOB = "cleaning-plan-reminder";

/**
 * Once-a-day guard, the same compare-and-set the catering digest uses
 * (app/api/cron/catering/digest.ts): the job_cursors row's last_event_at
 * moves to now only if it was before store midnight, so of any number of
 * hourly runs, exactly one queues today's alert. `release` undoes our own
 * claim when the work after it fails, so the next hour retries instead of
 * skipping the day.
 */
async function claimToday(
  supabase: Client,
  job: string,
  today: string,
  now: Date,
): Promise<{ claimed: boolean; release: () => Promise<void>; error?: string }> {
  const nowIso = now.toISOString();
  const dayStartIso = storeDateTimeInputToIso(`${today}T00:00`);
  const none = async () => {};
  if (!dayStartIso) return { claimed: false, release: none, error: "could not compute store midnight" };

  const { data: cursor, error: readError } = await supabase
    .from("job_cursors")
    .select("last_event_at")
    .eq("job_name", job)
    .maybeSingle();
  if (readError) return { claimed: false, release: none, error: readError.message };
  const previous: string | null = cursor?.last_event_at ?? null;

  const { error: seedError } = await supabase
    .from("job_cursors")
    .upsert({ job_name: job, updated_at: nowIso }, { onConflict: "job_name", ignoreDuplicates: true });
  if (seedError) return { claimed: false, release: none, error: seedError.message };

  const { data: claimed, error: claimError } = await supabase
    .from("job_cursors")
    .update({ last_event_at: nowIso, updated_at: nowIso })
    .eq("job_name", job)
    .or(`last_event_at.is.null,last_event_at.lt."${dayStartIso}"`)
    .select("job_name");
  if (claimError) return { claimed: false, release: none, error: claimError.message };
  if (!claimed || claimed.length === 0) return { claimed: false, release: none };

  return {
    claimed: true,
    release: async () => {
      const { error } = await supabase
        .from("job_cursors")
        .update({ last_event_at: previous, updated_at: nowIso })
        .eq("job_name", job)
        .eq("last_event_at", nowIso);
      if (error) console.error(`cleaning ${job}: failed to release claim`, error.message);
    },
  };
}

/**
 * Who gets the coordinator notices: everyone tagged as cleaning coordinator
 * with an active profile. With nobody tagged yet, the role-level planners
 * (Location Manager, Director) get them, so the notices are never silently
 * dropped.
 */
export async function loadCoordinatorIds(supabase: Client): Promise<string[]> {
  const { data: tagged, error } = await supabase
    .from("cleaning_coordinators")
    .select("user_id, profile:profiles!cleaning_coordinators_user_id_fkey(active)");
  if (error) throw new Error(`Could not load coordinators: ${error.message}`);
  const active = (tagged ?? []).filter((row) => row.profile?.active).map((row) => row.user_id);
  if (active.length > 0) return active;

  const { data: grants, error: grantError } = await supabase
    .from("role_permissions")
    .select("role_id")
    .eq("permission_key", "cleaning.plan");
  if (grantError) throw new Error(`Could not load planner roles: ${grantError.message}`);
  const roleIds = (grants ?? []).map((g) => g.role_id);
  if (roleIds.length === 0) return [];
  const { data: planners, error: plannerError } = await supabase
    .from("profiles")
    .select("id")
    .eq("active", true)
    .in("role_id", roleIds);
  if (plannerError) throw new Error(`Could not load planners: ${plannerError.message}`);
  return (planners ?? []).map((p) => p.id);
}

/**
 * Item name, area and kind for every item, in two queries. The whole master
 * list (a few hundred rows at most) rather than an id filter: a week with
 * FOH on can hold enough ids to make an `in` filter's URL too long.
 */
async function loadItemLabels(supabase: Client): Promise<Map<string, { name: string; zoneName: string; kind: ItemKind }>> {
  const labels = new Map<string, { name: string; zoneName: string; kind: ItemKind }>();
  const [{ data: items, error: itemError }, { data: zones, error: zoneError }] = await Promise.all([
    supabase.from("cleaning_items").select("id, name, kind, zone_id"),
    supabase.from("cleaning_zones").select("id, name"),
  ]);
  if (itemError) throw new Error(`Could not load items: ${itemError.message}`);
  if (zoneError) throw new Error(`Could not load zones: ${zoneError.message}`);
  const zoneNames = new Map((zones ?? []).map((z) => [z.id, z.name]));
  for (const item of items ?? []) {
    labels.set(item.id, { name: item.name, zoneName: zoneNames.get(item.zone_id) ?? "", kind: item.kind as ItemKind });
  }
  return labels;
}

/**
 * The morning summary of yesterday's cleans: a #cleaning post with the
 * counts and missed items, and, when something was missed, an in-app notice
 * to the coordinators. Runs from 6am (SUMMARY_FROM), after the 3am
 * close_cleaning_days has turned yesterday's open cleans into misses, so the
 * counts are final. The caller skips it in a run whose close failed.
 */
export async function queueDailySummary(
  supabase: Client,
  { today, timeOfDay, now }: { today: string; timeOfDay: string; now: Date },
): Promise<AlertResult> {
  if (timeOfDay < SUMMARY_FROM) return { status: "skipped" };
  const day = summaryDayFor(today);
  if (!day) return { status: "skipped" };

  const claim = await claimToday(supabase, SUMMARY_JOB, today, now);
  if (claim.error) return { status: "error", error: claim.error };
  if (!claim.claimed) return { status: "already_sent" };

  try {
    const { data: rows, error } = await supabase
      .from("cleaning_assignments")
      .select("id, item_id, status, half, rejected_at, owner_user_id")
      .eq("date", day);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return { status: "skipped" };

    const missedIds = rows.filter((r) => r.status === "missed").map((r) => r.id);
    let carriedOver = 0;
    if (missedIds.length > 0) {
      const { count, error: carryError } = await supabase
        .from("cleaning_assignments")
        .select("id", { count: "exact", head: true })
        .eq("origin", "carry_over")
        .in("carried_from_id", missedIds);
      if (carryError) throw new Error(carryError.message);
      carriedOver = count ?? 0;
    }

    const labels = await loadItemLabels(supabase);
    const summaryRows: SummaryRow[] = rows.map((r) => ({
      status: r.status as AssignmentStatus,
      rejected: r.rejected_at !== null,
      ownerless: r.status === "missed" && r.owner_user_id === null,
      itemName: labels.get(r.item_id)?.name ?? "Unknown item",
      zoneName: labels.get(r.item_id)?.zoneName ?? "",
      half: r.half as SlotHalf,
    }));
    const summary = buildDailySummary({ date: day, rows: summaryRows, carriedOver });
    if (!summary) return { status: "skipped" };

    const events: Database["public"]["Tables"]["app_events"]["Insert"][] = [
      {
        event_key: "cleaning_daily_summary",
        // No user ids: the Discord sender @mentions an event's recipient.
        payload: { title: summary.title, message: summary.message, summaryDate: day, ...summary.counts },
      },
    ];
    const notice = buildMissesNotice(summary);
    const coordinators = notice ? await loadCoordinatorIds(supabase) : [];
    if (notice && coordinators.length > 0) {
      events.push({
        event_key: "cleaning_misses",
        payload: { ...notice, summaryDate: day, user_ids: coordinators },
      });
    }

    const { error: insertError } = await supabase.from("app_events").insert(events);
    if (insertError) throw new Error(insertError.message);
    return { status: "queued" };
  } catch (error) {
    await claim.release();
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Monday's #cleaning post for a week that just went live. The caller passes
 * only weeks whose published_at it stamped in this run (an update filtered on
 * published_at is null), so each week posts once. If this insert fails the
 * post is lost rather than retried; a missing announcement is harmless and
 * re-sending risks a duplicate.
 */
export async function queueWeekPublished(supabase: Client, weekStart: string): Promise<AlertResult> {
  try {
    const rows = (await loadWeekAssignments(supabase, weekStart)).filter((r) => r.status !== "skipped");
    const labels = await loadItemLabels(supabase);
    const weekRows: WeekRow[] = rows.map((r) => ({
      date: r.date,
      half: r.half as SlotHalf,
      itemName: labels.get(r.item_id)?.name ?? "Unknown item",
      zoneName: labels.get(r.item_id)?.zoneName ?? "",
      kind: labels.get(r.item_id)?.kind ?? "constant",
    }));
    const post = buildWeekPublished({ weekStart, rows: weekRows });
    const { error } = await supabase.from("app_events").insert({
      event_key: "cleaning_week_published",
      payload: { ...post, weekStart, planned: weekRows.length },
    });
    if (error) throw new Error(error.message);
    return { status: "queued" };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}

/** Saturday's in-app "plan next week" reminder to the coordinators. */
export async function queuePlanReminder(
  supabase: Client,
  { today, timeOfDay, timeZone, now }: { today: string; timeOfDay: string; timeZone: string; now: Date },
): Promise<AlertResult> {
  if (!isPlanReminderTime(today, timeOfDay)) return { status: "skipped" };

  const claim = await claimToday(supabase, REMINDER_JOB, today, now);
  if (claim.error) return { status: "error", error: claim.error };
  if (!claim.claimed) return { status: "already_sent" };

  try {
    const coordinators = await loadCoordinatorIds(supabase);
    if (coordinators.length === 0) return { status: "skipped" };

    const nextWeekStart = addDays(boardWeekStart(today), 7);
    const [week, existing, items, lastDone, plannedBefore] = await Promise.all([
      loadWeek(supabase, nextWeekStart),
      loadWeekAssignments(supabase, nextWeekStart),
      loadPlanItems(supabase),
      loadLastDone(supabase, timeZone),
      loadPlannedBefore(supabase, nextWeekStart),
    ]);
    const kindById = new Map(items.map((i) => [i.id, i.kind]));
    const tray = dueNotPlaced({
      weekStart: nextWeekStart,
      items,
      lastDone: projectLastDone(lastDone, plannedBefore),
      existing: existing.map((e) => ({
        item_id: e.item_id,
        date: e.date,
        half: e.half as SlotHalf,
        status: e.status as AssignmentStatus,
        itemKind: kindById.get(e.item_id) ?? "constant",
      })),
    });
    const reminder = buildPlanReminder({
      nextWeekStart,
      built: Boolean(week?.built_at),
      planned: existing.filter((e) => e.status !== "skipped").length,
      dueNotPlaced: tray.length,
    });

    const { error } = await supabase.from("app_events").insert({
      event_key: "cleaning_plan_reminder",
      payload: { ...reminder, weekStart: nextWeekStart, user_ids: coordinators },
    });
    if (error) throw new Error(error.message);
    return { status: "queued" };
  } catch (error) {
    await claim.release();
    return { status: "error", error: error instanceof Error ? error.message : String(error) };
  }
}
