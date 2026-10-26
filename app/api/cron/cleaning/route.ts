import { NextRequest, NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { loadStoreClock } from "@/app/(app)/cleaning/queries";
import { buildCleaningWeek } from "@/app/(app)/cleaning/week-build";
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
 * 4. Stamp published_at on any week whose Monday has arrived; the week is
 *    live then, edited or not.
 *
 * Discord posts and in-app alerts are a later slice and are not sent here.
 */

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
  const { today, timeOfDay, timeZone } = await loadStoreClock(supabase);

  let closed: unknown = null;
  if (timeOfDay >= CLOSE_FROM) {
    const { data, error: closeError } = await supabase.rpc("close_cleaning_days", { p_today: today });
    if (closeError) {
      return NextResponse.json({ error: `close: ${closeError.message}` }, { status: 500 });
    }
    closed = data;
  }

  try {
    const currentWeek = boardWeekStart(today);
    const current = await buildCleaningWeek(supabase, { weekStart: currentWeek, today, timeOfDay, timeZone });

    const weekday = isoWeekday(today);
    const buildNext = (weekday === 4 && timeOfDay >= BUILD_FROM) || weekday === 5 || weekday === 6;
    const next = buildNext
      ? await buildCleaningWeek(supabase, { weekStart: addDays(currentWeek, 7), today, timeOfDay, timeZone })
      : null;

    const { error: publishError } = await supabase
      .from("cleaning_weeks")
      .update({ published_at: new Date().toISOString() })
      .lte("week_start", today)
      .is("published_at", null);
    if (publishError) throw new Error(`publish: ${publishError.message}`);

    return NextResponse.json({ ok: true, today, closed, current, next });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
