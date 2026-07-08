import { NextResponse, type NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { materializeTasksForDate } from "@/app/(app)/tasks/materialize";
import { markOverdueTasks } from "@/app/(app)/tasks/overdue";
import { processTaskEvents } from "@/app/(app)/tasks/system-tasks";
import { isCronAuthorized } from "@/app/api/tasks/cron-auth";

/**
 * Nightly full sync for the Tasks module (PLAN.md S2 brief: "Nightly run
 * materialization" + "due handling" + "System-created task kinds ... accepted
 * via event bus consumer"). Scheduled in vercel.json at `0 4 * * *`.
 *
 * Vercel Cron invokes scheduled paths via GET with an
 * `Authorization: Bearer $CRON_SECRET` header, so this route exports GET (with
 * POST delegating to it for manual/pg_cron triggers) and authenticates with
 * the shared `CRON_SECRET`, exactly like every sibling cron route
 * (app/api/cron/*). Auth fails CLOSED: with no `CRON_SECRET` set the endpoint
 * refuses every request instead of running unauthenticated.
 *
 * The time-sensitive half (overdue sweep + event->system-task processing) also
 * runs on the more frequent `/api/tasks/events` route so a reward claim or a
 * flagged-answer follow-up becomes a task within minutes, not up to 24h. This
 * route keeps doing the full run (including the once-a-day materialization) so
 * a deployment that only schedules `/api/tasks/sync` still works end to end.
 *
 * Uses the service-role client because this runs with no signed-in user; every
 * write here is scoped to tables S2 owns (tasks, task_templates) plus reads of
 * the shared app_events table.
 */
async function run(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const today = new Date().toISOString().slice(0, 10);

  const [materialized, overdue, events] = await Promise.all([
    materializeTasksForDate(supabase, today),
    markOverdueTasks(supabase),
    processTaskEvents(supabase),
  ]);

  return NextResponse.json({ materialized, overdue, events });
}

export function GET(request: NextRequest) {
  return run(request);
}

export function POST(request: NextRequest) {
  return run(request);
}
