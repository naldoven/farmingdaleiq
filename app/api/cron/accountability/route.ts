import { NextRequest, NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { computeActivePoints, shouldExpirePendingAction } from "@/app/(app)/accountability/logic";

/**
 * Scheduled job for Accountability (PLAN.md S6: "rolling 60-day expiry job").
 *
 * `expires_at` on `infractions` already makes point expiry a read-time
 * computation (computeActivePoints in logic.ts filters out expired rows on
 * every read, the same "never store a derived total" principle the token
 * ledger uses) -- issuing a NEW infraction is also where threshold
 * escalation is checked (app/(app)/accountability/actions.ts issueInfraction),
 * since points only ever go UP at that moment. So the one thing genuinely
 * time-based rather than event-based is: a 'pending' disciplinary_actions row
 * whose triggering threshold is no longer met (the user's active points
 * decayed back below it before anyone acted) should resolve on its own
 * instead of sitting "pending" forever. That's what this sweep does --
 * see logic.ts shouldExpirePendingAction for the exact rule and the caveat
 * that this is an interpretation choice flagged for product review.
 *
 * There's no existing scheduled-function/cron wiring in this repo yet (same
 * gap the Checklists stream's app/api/cron/checklists/route.ts documents), so
 * this stream adds its own route handler under a scoped path:
 *   - Vercel Cron: add a `crons` entry in `vercel.json` for
 *     `/api/cron/accountability` (e.g. nightly, `"schedule": "0 5 * * *"`)
 *     with `CRON_SECRET` set in the project env vars so Vercel's automatic
 *     `Authorization: Bearer $CRON_SECRET` header authenticates the request.
 *   - Or a Supabase `pg_cron` job hitting this URL with the same header via
 *     `pg_net`.
 * `vercel.json` doesn't exist in this repo yet and is outside this stream's
 * owned files, so wiring the actual trigger is a P2/deploy-checklist item --
 * this route is safe to call manually or via curl in the meantime.
 *
 * Idempotent: only ever touches 'pending' rows, so re-running it (or running
 * it twice concurrently) never double-resolves an action.
 */

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

  const [{ data: pendingActions, error: pendingError }, { data: ladder, error: ladderError }] =
    await Promise.all([
      supabase
        .from("disciplinary_actions")
        .select("id, user_id, type_id, status")
        .eq("status", "pending"),
      supabase.from("disciplinary_action_types").select("id, threshold_points"),
    ]);

  if (pendingError) {
    return NextResponse.json({ error: pendingError.message }, { status: 500 });
  }
  if (ladderError) {
    return NextResponse.json({ error: ladderError.message }, { status: 500 });
  }

  const thresholdById = new Map((ladder ?? []).map((t) => [t.id, t.threshold_points]));
  const userIds = Array.from(new Set((pendingActions ?? []).map((a) => a.user_id)));

  const activePointsByUser = new Map<string, number>();
  for (const userId of userIds) {
    const { data: infractions, error: infractionsError } = await supabase
      .from("infractions")
      .select("points, expires_at")
      .eq("user_id", userId);
    if (infractionsError) {
      return NextResponse.json({ error: infractionsError.message }, { status: 500 });
    }
    activePointsByUser.set(userId, computeActivePoints(infractions ?? [], now));
  }

  let expiredCount = 0;
  for (const action of pendingActions ?? []) {
    const threshold = thresholdById.get(action.type_id);
    const activePoints = activePointsByUser.get(action.user_id) ?? 0;
    if (threshold === undefined) continue;

    if (shouldExpirePendingAction(action, activePoints, threshold)) {
      const { error: updateError } = await supabase
        .from("disciplinary_actions")
        .update({ status: "expired" })
        .eq("id", action.id)
        .eq("status", "pending");
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      expiredCount += 1;
    }
  }

  return NextResponse.json({ ok: true, checked: (pendingActions ?? []).length, expired: expiredCount });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
