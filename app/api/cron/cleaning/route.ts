import { NextRequest, NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { loadStoreClock } from "@/app/(app)/cleaning/queries";
import { buildCleaningWeek } from "@/app/(app)/cleaning/week-build";
import {
  queueDailySummary,
  queuePlanReminder,
  queueWeekPublished,
  SUMMARY_FROM,
  type AlertResult,
} from "@/app/api/cron/cleaning/alerts";
import { addDays, boardWeekStart, isoWeekday } from "@/app/(app)/cleaning/week-logic";

/**
 * Hourly cleaning job (docs/CLEANING-PLAN.md "How a week runs"). Every step
 * is safe to repeat, so running hourly instead of at exact times means a
 * missed or failed run is simply caught up by the next one:
 *
 * 1. From 3am, close past days: cleans still planned on an earlier
 *    store-local day become misses and carry over once
 *    (close_cleaning_days). Waiting until 3am lets the closing shift finish
 *    and photograph last night's list after midnight.
 * 2. Build the current week if it was never built (first week live, or a
 *    Thursday build that failed). Nothing lands before today.
 * 3. From Thursday 8pm through Saturday, build next week so Mariana can edit
 *    it before it goes live.
 * 4. From 6am, stamp published_at on any week whose Monday has arrived and
 *    post "week is live" to #cleaning. The week is live from Monday either
 *    way; the stamp only marks the post as sent, so it waits for a sensible
 *    hour instead of going out at midnight.
 * 5. Alerts (app/api/cron/cleaning/alerts.ts), each at most once a day: from
 *    6am, yesterday's summary to #cleaning plus a misses notice to the
 *    coordinators; Saturday from 10am, the "plan next week" reminder.
 *
 * Each step runs on its own: a failing close skips only the summary (whose
 * counts depend on it), and a failing build skips nothing else, so the
 * Saturday reminder still goes out in exactly the case a build is stuck
 * (PR #92 review). Any failure makes the response a 500 and is logged, so it
 * shows in Vercel's logs; the next hour retries it.
 */

/** Earliest store time for the Monday "week is live" post. */
const PUBLISH_FROM = SUMMARY_FROM;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Thursday-night build time, store-local. */
const BUILD_FROM = "20:00:00";
/** Earliest store-local time the day-end close runs. */
const CLOSE_FROM = "03:00:00";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const now = new Date();
  const { today, timeOfDay, timeZone } = await loadStoreClock(supabase, now);

  const errors: string[] = [];
  const fail = (step: string, message: string) => {
    console.error(`cleaning cron: ${step} failed`, message);
    errors.push(`${step}: ${message}`);
  };
  const noteAlert = (step: string, result: AlertResult) => {
    if (result.status === "error") fail(step, result.error ?? "unknown error");
    return result;
  };

  let closed: unknown = null;
  let closeOk = true;
  if (timeOfDay >= CLOSE_FROM) {
    const { data, error: closeError } = await supabase.rpc("close_cleaning_days", { p_today: today });
    if (closeError) {
      closeOk = false;
      fail("close", closeError.message);
    } else {
      closed = data;
    }
  }

  const currentWeek = boardWeekStart(today);
  let current: unknown = null;
  try {
    current = await buildCleaningWeek(supabase, { weekStart: currentWeek, today, timeOfDay, timeZone });
  } catch (error) {
    fail("build this week", errorMessage(error));
  }

  const weekday = isoWeekday(today);
  const buildNext = (weekday === 4 && timeOfDay >= BUILD_FROM) || weekday === 5 || weekday === 6;
  let next: unknown = null;
  if (buildNext) {
    try {
      next = await buildCleaningWeek(supabase, { weekStart: addDays(currentWeek, 7), today, timeOfDay, timeZone });
    } catch (error) {
      fail("build next week", errorMessage(error));
    }
  }

  // Filtering on published_at is null and reading back what this update
  // stamped is what makes each week's post go out exactly once.
  const weekPosts: AlertResult[] = [];
  if (timeOfDay >= PUBLISH_FROM) {
    const { data: published, error: publishError } = await supabase
      .from("cleaning_weeks")
      .update({ published_at: now.toISOString() })
      .lte("week_start", today)
      .is("published_at", null)
      .select("week_start");
    if (publishError) fail("publish", publishError.message);
    for (const week of published ?? []) {
      weekPosts.push(noteAlert("week post", await queueWeekPublished(supabase, week.week_start)));
    }
  }

  // The summary reports yesterday's misses, which only exist once the close
  // has run, so a run whose close failed leaves it for the next hour.
  const summary = closeOk
    ? noteAlert("daily summary", await queueDailySummary(supabase, { today, timeOfDay, now }))
    : { status: "skipped" as const };
  const reminder = noteAlert("plan reminder", await queuePlanReminder(supabase, { today, timeOfDay, timeZone, now }));

  const body = { ok: errors.length === 0, today, closed, current, next, weekPosts, summary, reminder, errors };
  return NextResponse.json(body, { status: errors.length === 0 ? 200 : 500 });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
