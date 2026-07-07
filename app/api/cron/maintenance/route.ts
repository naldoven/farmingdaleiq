import { NextRequest, NextResponse } from "next/server";

import { emitEvent } from "@/lib/events/bus";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  addDays,
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
 * Same "no existing cron wiring in this repo yet" situation documented in
 * app/api/cron/checklists/route.ts (S1): no `vercel.json`, so this stream
 * adds its own route handler under a scoped path rather than editing shared
 * config. Wire it up the same way:
 *   - Vercel Cron: a `crons` entry in `vercel.json` (outside this stream's
 *     owned files — a P2/deploy-checklist item) pointing at
 *     `/api/cron/maintenance` with a daily schedule, `CRON_SECRET` set in
 *     the project env vars so Vercel's `Authorization: Bearer $CRON_SECRET`
 *     header authenticates the request.
 *   - Or a Supabase pg_cron job hitting this URL with the same header via
 *     pg_net.
 * Safe to call manually/via curl with the right bearer token in the
 * meantime.
 *
 * Idempotent (PLAN.md ground rules): a schedule already represented by an
 * open (non-terminal) work order is skipped (see planPmGeneration in
 * app/(app)/maintenance/logic.ts), so calling this repeatedly on the same
 * day never double-generates a work order for the same due cycle.
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
