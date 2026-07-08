import { NextResponse, type NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { markOverdueTasks } from "@/app/(app)/tasks/overdue";
import { processTaskEvents } from "@/app/(app)/tasks/system-tasks";
import { isCronAuthorized } from "@/app/api/tasks/cron-auth";

/**
 * Frequent Tasks event drain (split out of the nightly `/api/tasks/sync`).
 *
 * The audit flagged that bundling event processing into the once-a-day sync
 * meant a reward claim or a flagged-answer follow-up could take up to 24h to
 * become a task. This route runs only the time-sensitive work — the overdue
 * sweep and the app_events -> system-task consumer — so it is cheap to run on
 * a short interval (schedule `/api/tasks/events` in vercel.json on the same
 * every-few-minutes cadence as the other frequent crons; the nightly sync
 * still covers materialization).
 *
 * Same fail-closed `CRON_SECRET` Bearer auth and GET/POST shape as every
 * sibling cron route, and the same service-role client (no signed-in user).
 */
async function run(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const [overdue, events] = await Promise.all([
    markOverdueTasks(supabase),
    processTaskEvents(supabase),
  ]);

  return NextResponse.json({ overdue, events });
}

export function GET(request: NextRequest) {
  return run(request);
}

export function POST(request: NextRequest) {
  return run(request);
}
