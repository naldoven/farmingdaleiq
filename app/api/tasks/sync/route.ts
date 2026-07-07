import { NextResponse, type NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { materializeTasksForDate } from "@/app/(app)/tasks/materialize";
import { markOverdueTasks } from "@/app/(app)/tasks/overdue";
import { processTaskEvents } from "@/app/(app)/tasks/system-tasks";

/**
 * Scheduled job for the Tasks module (PLAN.md S2 brief: "Nightly run
 * materialization as a Supabase scheduled function" + "due handling" +
 * "System-created task kinds ... accepted via event bus consumer").
 *
 * This repo has no Supabase Edge Functions yet (supabase/functions doesn't
 * exist) and root-level scheduler config (vercel.json) is shared across
 * every stream that needs a periodic job (S1 checklist runs, S6
 * accountability expiry, S8 PM schedules, ...), so it isn't touched here to
 * avoid cross-stream conflicts. Instead this is a plain route handler; wire
 * ONE of the following up externally once all streams have landed:
 *   - Vercel Cron: add a `crons` entry in vercel.json calling
 *     `POST /api/tasks/sync` (recommended: every 15 minutes covers both the
 *     "nightly" materialization — idempotent, so running it more often than
 *     once a day is harmless — and timely overdue/event processing).
 *   - Supabase pg_cron + `net.http_post` calling this URL on the same
 *     schedule, if the team prefers to keep scheduling inside Postgres.
 * Either way, set TASKS_CRON_SECRET in the environment and have the
 * scheduler send it as `X-Cron-Secret` so this endpoint isn't publicly
 * triggerable.
 *
 * Uses the service-role client because this runs with no signed-in user;
 * every write here is scoped to tables S2 owns (tasks, task_templates) plus
 * reads of the shared app_events table.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.TASKS_CRON_SECRET;
  if (expected) {
    const provided = request.headers.get("x-cron-secret");
    if (provided !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
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
