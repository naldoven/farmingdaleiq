import { NextRequest, NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { awardTokens } from "@/lib/tokens/ledger";
import { resolveAwardsForEvents, type AppEventForConsumer } from "@/app/(app)/tokens/logic";

/**
 * Earning-rule event consumer (PLAN.md S7: "earning-rule consumer of
 * task_complete, checklist_complete, top_performer events"). There's no
 * existing scheduled-function/cron wiring in this repo (no `vercel.json`),
 * so -- same precedent as app/api/cron/checklists/route.ts (S1) -- this
 * stream adds its own scoped route and documents how to schedule it rather
 * than editing any shared config:
 *   - Vercel Cron: add a `crons` entry in `vercel.json` for
 *     `/api/cron/tokens` (e.g. every few minutes: `"schedule": "*\/5 * * * *"`)
 *     with `CRON_SECRET` set in the project env vars so Vercel's automatic
 *     `Authorization: Bearer $CRON_SECRET` header authenticates the request.
 *   - Or a Supabase `pg_cron` job hitting this URL the same way via
 *     `net.http_post` (the `pg_net` extension).
 * `vercel.json` doesn't exist in this repo yet and is outside this stream's
 * owned files, so wiring the actual cron trigger is a P2/deploy-checklist
 * item -- this route is safe to call manually or via curl in the meantime.
 *
 * Idempotency: app_events is shared with other consumers (docs/agent-map.md:
 * S10 Notifications+Discord also reacts to some of the same event keys, like
 * top_performer), so this route does NOT set app_events.processed_at --
 * doing so would hide those rows from S10's own consumer. Instead it keeps
 * its OWN cursor table, token_processed_events (this stream's migration:
 * supabase/migrations/20260707030000_tokens_rewards_feed_rls.sql), and only
 * ever inserts a row there once it has finished handling that event_id, so
 * re-running this route (a retried cron tick, an overlapping invocation) is
 * safe -- already-recorded events are skipped, not re-awarded.
 */

const CONSUMED_EVENT_KEYS = ["task_complete", "checklist_complete", "top_performer"] as const;
const BATCH_SIZE = 200;

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

  const { data: events, error: eventsError } = await supabase
    .from("app_events")
    .select("id, event_key, payload")
    .in("event_key", CONSUMED_EVENT_KEYS as unknown as string[])
    .order("created_at")
    .limit(BATCH_SIZE);

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const candidateIds = (events ?? []).map((e) => e.id);
  const { data: alreadyProcessed, error: processedError } = candidateIds.length
    ? await supabase.from("token_processed_events").select("event_id").in("event_id", candidateIds)
    : { data: [] as { event_id: string }[], error: null };

  if (processedError) {
    return NextResponse.json({ error: processedError.message }, { status: 500 });
  }

  const processedIds = new Set((alreadyProcessed ?? []).map((r) => r.event_id));
  const unprocessed = (events ?? []).filter((e) => !processedIds.has(e.id)) as AppEventForConsumer[];

  const { data: rules, error: rulesError } = await supabase
    .from("token_earning_rules")
    .select("event_key, amount")
    .in("event_key", CONSUMED_EVENT_KEYS as unknown as string[]);

  if (rulesError) {
    return NextResponse.json({ error: rulesError.message }, { status: 500 });
  }

  const ruleAmountByEventKey = Object.fromEntries((rules ?? []).map((r) => [r.event_key, r.amount]));
  const awards = resolveAwardsForEvents(unprocessed, ruleAmountByEventKey);
  const awardByEventId = new Map(awards.map((a) => [a.eventId, a]));

  let awardedCount = 0;
  const errors: string[] = [];

  for (const event of unprocessed) {
    const award = awardByEventId.get(event.id);

    try {
      if (award) {
        await awardTokens(
          {
            userId: award.userId,
            amount: award.amount,
            kind: award.kind,
            ref: { event_id: event.id, event_key: event.event_key },
            createdBy: null,
          },
          supabase
        );

        if (award.kind === "top_performer") {
          const payload = event.payload ?? {};
          const note = typeof payload.note === "string" ? payload.note : null;
          const { error: postError } = await supabase.from("feed_posts").insert({
            kind: "top_performer",
            author_id: null,
            subject_user_id: award.userId,
            body: note ?? "Shift Top Performer",
            tokens_awarded: award.amount,
          });
          if (postError) throw new Error(postError.message);
        }

        awardedCount += 1;
      }

      // Record this event as handled whether or not it resolved to an
      // award (e.g. no user_id, or a 0-amount rule) -- there's nothing more
      // to do for it, ever, so it shouldn't be re-evaluated on every tick.
      const { error: markError } = await supabase
        .from("token_processed_events")
        .insert({ event_id: event.id });
      if (markError) throw new Error(markError.message);
    } catch (error) {
      // Deliberately do NOT mark this event processed -- leave it for the
      // next tick to retry.
      errors.push(`${event.id}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    scanned: unprocessed.length,
    awarded: awardedCount,
    errors,
  });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
