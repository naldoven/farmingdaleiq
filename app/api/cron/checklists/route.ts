import { NextRequest, NextResponse } from "next/server";

import { emitEvent } from "@/lib/events/bus";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isScheduleDueOn } from "@/app/(app)/checklists/logic";

/**
 * Scheduled job for Checklists (ARCHITECTURE.md "Technical architecture":
 * "a nightly job materializes the day's checklist runs ... from schedules";
 * PLAN.md S1 "Nightly run materialization as a Supabase scheduled function").
 *
 * There's no existing scheduled-function/cron wiring in this repo yet (no
 * `vercel.json`, no other `app/api/cron/*` route), so this stream adds its
 * own route handler under a scoped path and documents how to schedule it
 * rather than editing any shared config:
 *   - Vercel Cron: add a `crons` entry in `vercel.json` pointing at
 *     `/api/cron/checklists` (e.g. `"schedule": "0 4 * * *"` for a nightly
 *     run at 4am store time, plus a more frequent hit, e.g. every 15 minutes,
 *     if the overdue/missed sweep below should run more often than nightly)
 *     with `CRON_SECRET` set in the project env vars so Vercel's automatic
 *     `Authorization: Bearer $CRON_SECRET` header authenticates the request.
 *   - Or a Supabase `pg_cron` job hitting this URL with the same header via
 *     `net.http_get`/`http_post` (the `pg_net` extension).
 * `vercel.json` doesn't exist in this repo yet and is outside this stream's
 * owned files, so wiring the actual cron trigger is a P2/deploy-checklist
 * item -- this route is safe to call manually or via curl in the meantime.
 *
 * Does two idempotent things on every call:
 * 1. Materializes today's checklist_runs from checklist_schedules that are
 *    due today and whose template is active (skips a schedule that already
 *    has a run for today).
 * 2. Flags any pending/in_progress run whose schedule has
 *    alert_on_incomplete = true and whose due_time has passed as `missed`,
 *    emitting `checklist_missed` once per newly-missed run.
 */

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function emitEventSafely(key: Parameters<typeof emitEvent>[0], payload: Record<string, unknown>) {
  try {
    await emitEvent(key, payload);
  } catch (error) {
    console.error(`checklists cron: emitEvent(${key}) failed`, error);
  }
}

async function run(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  // Best-effort wall-clock time-of-day comparison for the overdue sweep
  // below; this compares against the server runtime's local clock rather
  // than the store's configured timezone (stores.timezone). Flagged for a
  // P2 fix once a store-timezone-aware "now" helper exists.
  const nowTimeOfDay = now.toTimeString().slice(0, 8);

  const [{ data: schedules, error: schedulesError }, { data: templates, error: templatesError }] =
    await Promise.all([
      supabase
        .from("checklist_schedules")
        .select("id, template_id, frequency, days_of_week, day_of_month, day_part_id, assign_position_id, due_time, alert_on_incomplete"),
      supabase.from("checklist_templates").select("id, active"),
    ]);

  if (schedulesError) {
    return NextResponse.json({ error: schedulesError.message }, { status: 500 });
  }
  if (templatesError) {
    return NextResponse.json({ error: templatesError.message }, { status: 500 });
  }

  const activeTemplateIds = new Set((templates ?? []).filter((t) => t.active).map((t) => t.id));
  const dueSchedules = (schedules ?? []).filter(
    (s) => activeTemplateIds.has(s.template_id) && isScheduleDueOn(s, now),
  );

  let materializedCount = 0;
  if (dueSchedules.length > 0) {
    const { data: existingRuns, error: existingRunsError } = await supabase
      .from("checklist_runs")
      .select("schedule_id")
      .eq("run_date", today)
      .in(
        "schedule_id",
        dueSchedules.map((s) => s.id),
      );
    if (existingRunsError) {
      return NextResponse.json({ error: existingRunsError.message }, { status: 500 });
    }

    const scheduleIdsWithRun = new Set((existingRuns ?? []).map((r) => r.schedule_id));

    for (const schedule of dueSchedules) {
      if (scheduleIdsWithRun.has(schedule.id)) continue;

      const { error: insertError } = await supabase.from("checklist_runs").insert({
        template_id: schedule.template_id,
        schedule_id: schedule.id,
        run_date: today,
        day_part_id: schedule.day_part_id,
        assigned_position_id: schedule.assign_position_id,
        status: "pending",
      });
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      materializedCount += 1;
    }
  }

  const alertScheduleIds = new Set(
    (schedules ?? []).filter((s) => s.alert_on_incomplete && s.due_time).map((s) => s.id),
  );
  const dueTimeBySchedule = new Map((schedules ?? []).map((s) => [s.id, s.due_time]));

  const { data: openRuns, error: openRunsError } = await supabase
    .from("checklist_runs")
    .select("id, schedule_id, status")
    .eq("run_date", today)
    .in("status", ["pending", "in_progress"]);
  if (openRunsError) {
    return NextResponse.json({ error: openRunsError.message }, { status: 500 });
  }

  let missedCount = 0;
  for (const openRun of openRuns ?? []) {
    if (!openRun.schedule_id || !alertScheduleIds.has(openRun.schedule_id)) continue;
    const dueTime = dueTimeBySchedule.get(openRun.schedule_id);
    if (!dueTime || dueTime > nowTimeOfDay) continue;

    // Claim the transition atomically and only emit if THIS call actually
    // flipped the row, so overlapping cron invocations can't double-emit
    // checklist_missed for the same run.
    const { data: missedRows, error: updateError } = await supabase
      .from("checklist_runs")
      .update({ status: "missed" })
      .eq("id", openRun.id)
      .in("status", ["pending", "in_progress"])
      .select("id");
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    if (!missedRows || missedRows.length === 0) continue;
    missedCount += 1;
    await emitEventSafely("checklist_missed", { runId: openRun.id, scheduleId: openRun.schedule_id });
  }

  return NextResponse.json({ ok: true, materialized: materializedCount, missed: missedCount });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
