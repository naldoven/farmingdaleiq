import { NextResponse } from "next/server";

import { deliverPendingOutbox } from "@/lib/discord/outbox";

/**
 * Scheduled job: drains `discord_outbox` (send due `pending` rows, retry
 * with backoff, mark `failed` after MAX_ATTEMPTS). See
 * app/api/jobs/process-events/route.ts for the scheduling note and the
 * `CRON_SECRET` convention this route shares.
 *
 * Suggested cadence: every 1 minute (the first backoff tier is 1 minute, so
 * running less often than that just delays the fastest retries).
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await deliverPendingOutbox();
  return NextResponse.json(result);
}
