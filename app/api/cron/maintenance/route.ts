import { NextRequest, NextResponse } from "next/server";

import { emitEvent } from "@/lib/events/bus";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  addDays,
  pmChecklistRunInsert,
  planPmGeneration,
  resolvePmPriority,
  type PmScheduleLike,
} from "@/app/(app)/maintenance/logic";

/**
 * Scheduled job for preventive maintenance (ARCHITECTURE.md "Preventive
 * maintenance": "time-based schedules per equipment ... auto-generate a
 * work order N days before due"; PLAN.md S8 "PM schedules generating work
 * orders lead_days early (scheduled function)").
 *
 * Wired into Vercel Cron via the `crons` entry in vercel.json
 * (`/api/cron/maintenance`, `0 5 * * *`), which authenticates with
 * `Authorization: Bearer $CRON_SECRET`. Also safe to call manually/via curl
 * with the same bearer token, or from a Supabase pg_cron job over pg_net.
 *
 * Idempotent (PLAN.md ground rules): a schedule already represented by an
 * open (non-terminal) work order is skipped (see planPmGeneration in
 * app/(app)/maintenance/logic.ts), so calling this repeatedly on the same
 * day never double-generates a work order for the same due cycle.
 */

/**
 * Fails closed (401) whenever CRON_SECRET isn't set or doesn't match — this
 * route must never run unauthenticated in production. The two cases are
 * logged distinctly server-side (never in the response body, which stays a
 * generic 401) so a misconfigured deploy shows up as "CRON_SECRET is unset"
 * in the logs instead of looking identical to a stray/incorrect caller.
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("maintenance cron: CRON_SECRET is not set; refusing all requests");
    return false;
  }
  const provided = request.headers.get("authorization");
  if (provided !== `Bearer ${secret}`) {
    console.error("maintenance cron: rejected a request with a missing/incorrect bearer token");
    return false;
  }
  return true;
}

async function emitEventSafely(key: Parameters<typeof emitEvent>[0], payload: Record<string, unknown>) {
  try {
    await emitEvent(key, payload);
  } catch (error) {
    console.error(`maintenance cron: emitEvent(${key}) failed`, error);
  }
}

async function run(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: schedules, error: schedulesError } = await supabase
    .from("pm_schedules")
    .select(
      "id, equipment_id, title, description, interval_days, lead_days, next_due_on, checklist_template_id, assign_user_id, vendor_id, priority, active",
    )
    .eq("active", true);

  if (schedulesError) {
    return NextResponse.json({ error: schedulesError.message }, { status: 500 });
  }

  const scheduleList = (schedules ?? []) as PmScheduleLike[];
  if (scheduleList.length === 0) {
    return NextResponse.json({ ok: true, generated: 0 });
  }

  const { data: openWorkOrders, error: openWorkOrdersError } = await supabase
    .from("work_orders")
    .select("pm_schedule_id")
    .not("pm_schedule_id", "is", null)
    .not("status", "in", "(complete,cancelled)");

  if (openWorkOrdersError) {
    return NextResponse.json({ error: openWorkOrdersError.message }, { status: 500 });
  }

  const openScheduleIds = new Set(
    (openWorkOrders ?? [])
      .map((wo) => wo.pm_schedule_id)
      .filter((id): id is string => Boolean(id)),
  );

  const due = planPmGeneration(scheduleList, openScheduleIds, today);

  let generated = 0;
  for (const schedule of due) {
    // "Optional checklist procedure" (ARCHITECTURE.md "Preventive
    // maintenance"): materialize a real checklist_run from the schedule's
    // template before creating the work order, so the work order can link to
    // it. Best-effort: a failure here still lets the work order itself
    // generate rather than blocking PM generation on the checklist module.
    let checklistRunId: string | null = null;
    const checklistRunInsert = pmChecklistRunInsert(schedule, today);
    if (checklistRunInsert) {
      const { data: checklistRun, error: checklistRunError } = await supabase
        .from("checklist_runs")
        .insert({ ...checklistRunInsert, status: "pending" })
        .select("id")
        .single();

      if (checklistRunError || !checklistRun) {
        console.error(
          `maintenance cron: failed to create checklist run for schedule ${schedule.id}`,
          checklistRunError,
        );
      } else {
        checklistRunId = checklistRun.id;
      }
    }

    const { data: workOrder, error: insertError } = await supabase
      .from("work_orders")
      .insert({
        pm_schedule_id: schedule.id,
        title: schedule.title,
        description: schedule.description,
        equipment_id: schedule.equipment_id,
        priority: resolvePmPriority(schedule.priority),
        status: "open",
        assigned_user_id: schedule.assign_user_id,
        vendor_id: schedule.vendor_id,
        due_at: schedule.next_due_on,
        checklist_run_id: checklistRunId,
      })
      .select("id")
      .single();

    if (insertError || !workOrder) {
      console.error(`maintenance cron: failed to generate work order for schedule ${schedule.id}`, insertError);
      continue;
    }

    generated += 1;

    // Advance next_due_on so the schedule doesn't regenerate until its next
    // cycle. Guarded on the value we read it as, so a concurrent run that
    // already advanced it loses this no-op update instead of double-advancing.
    if (schedule.next_due_on) {
      await supabase
        .from("pm_schedules")
        .update({ next_due_on: addDays(schedule.next_due_on, schedule.interval_days) })
        .eq("id", schedule.id)
        .eq("next_due_on", schedule.next_due_on);
    }

    await emitEventSafely("pm_due", { pmScheduleId: schedule.id, workOrderId: workOrder.id });
    await emitEventSafely("work_order_status", { workOrderId: workOrder.id, status: "open" });
  }

  return NextResponse.json({ ok: true, generated });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
