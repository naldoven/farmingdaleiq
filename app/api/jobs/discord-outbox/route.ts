import { NextResponse } from "next/server";

import { deliverPendingOutbox } from "@/lib/discord/outbox";

/**
 * Scheduled job: drains `discord_outbox` (send due `pending` rows, retry
 * with backoff, mark `failed` after MAX_ATTEMPTS). See
 * app/api/jobs/process-events/route.ts for the scheduling note and the
 * `CRON_SECRET` convention this route shares (required in production, fails
 * closed with 503 when unset there).
 *
 * Suggested cadence: every 1 minute (the first backoff tier is 1 minute, so
 * running less often than that just delays the fastest retries).
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
    }
  } else {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await deliverPendingOutbox();
  return NextResponse.json(result);
}

/**
 * Vercel Cron invokes scheduled routes with GET (and its own
 * `Authorization: Bearer <CRON_SECRET>` header), so a POST-only route would
 * 405 on every scheduled run and the outbox would never deliver in
 * production (parity finding #6). Delegate to POST so both verbs share the
 * exact same auth check and delivery logic.
 */
export async function GET(request: Request) {
  return POST(request);
}
