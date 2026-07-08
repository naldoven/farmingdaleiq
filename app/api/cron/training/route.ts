import { NextRequest, NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { isRerateDue } from "@/app/(app)/ratings/logic";
import { ACTIVELY_WORKED_WINDOW_DAYS, activelyWorkedKeys, shouldCreateReratePrompt } from "@/app/api/cron/training/logic";

/**
 * Scheduled job for S4 Ratings/Training (ARCHITECTURE.md "Position
 * Ratings" > "Re-rate prompts": "30 days after a rating on an actively-worked
 * position, the system nudges a leader to re-rate").
 *
 * There's no existing scheduled-function/cron wiring shared across streams
 * (no `vercel.json`), so -- same precedent as
 * app/api/cron/checklists/route.ts (S1) and app/api/tasks/sync/route.ts
 * (S2) -- this stream adds its own scoped route handler and documents how to
 * schedule it rather than editing shared config:
 *   - Vercel Cron: add a `crons` entry in `vercel.json` for
 *     `/api/cron/training` (e.g. daily, `"schedule": "0 5 * * *"`) with
 *     `CRON_SECRET` set in the project env vars.
 *   - Or a Supabase pg_cron job hitting this URL with the same header.
 * Wiring the actual trigger is a P2/deploy-checklist item; this route is
 * safe to call manually or via curl in the meantime.
 *
 * Idempotent on every call: only inserts a rerate_prompts row for a
 * (user, position) pair that doesn't already have one unresolved.
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

  const activeWorkCutoff = new Date(now);
  activeWorkCutoff.setDate(activeWorkCutoff.getDate() - ACTIVELY_WORKED_WINDOW_DAYS);
  const activeWorkCutoffStr = activeWorkCutoff.toISOString().slice(0, 10);

  const [
    { data: currentRatings, error: ratingsError },
    { data: openPrompts, error: promptsError },
    { data: recentAssignments, error: assignmentsError },
  ] = await Promise.all([
    supabase.from("position_ratings").select("user_id, position_id, rated_at").eq("is_current", true),
    supabase.from("rerate_prompts").select("user_id, position_id").is("resolved_at", null),
    // "Actively-worked" gate: only positions someone has actually been
    // assigned to in a recent posted Setup, not merely rated once. Filters
    // the embedded setups.date via the required inner join.
    supabase
      .from("setup_assignments")
      .select("user_id, position_id, setups!inner(date)")
      .gte("setups.date", activeWorkCutoffStr),
  ]);

  if (ratingsError) {
    return NextResponse.json({ error: ratingsError.message }, { status: 500 });
  }
  if (promptsError) {
    return NextResponse.json({ error: promptsError.message }, { status: 500 });
  }
  if (assignmentsError) {
    return NextResponse.json({ error: assignmentsError.message }, { status: 500 });
  }

  const openPromptKeys = new Set((openPrompts ?? []).map((p) => `${p.user_id}:${p.position_id}`));
  const workedKeys = activelyWorkedKeys(recentAssignments ?? []);

  let createdCount = 0;
  for (const rating of currentRatings ?? []) {
    if (!rating.user_id || !rating.position_id) continue;
    const key = `${rating.user_id}:${rating.position_id}`;
    if (!isRerateDue(rating.rated_at, now)) continue;
    if (!shouldCreateReratePrompt({ hasOpenPrompt: openPromptKeys.has(key), activelyWorked: workedKeys.has(key) })) {
      continue;
    }

    const { error: insertError } = await supabase.from("rerate_prompts").insert({
      user_id: rating.user_id,
      position_id: rating.position_id,
      due_on: now.toISOString().slice(0, 10),
    });
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    openPromptKeys.add(key);
    createdCount += 1;
  }

  return NextResponse.json({ ok: true, rerate_prompts_created: createdCount });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
