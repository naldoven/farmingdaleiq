import { NextResponse } from "next/server";

import { processAppEvents } from "@/lib/notify/events";

/**
 * Scheduled job (PLAN.md S10 brief: "event-bus consumer... outbox worker
 * with retry/backoff (scheduled function)"): drains `app_events` into
 * in-app notifications, Web Push, and the Discord outbox.
 *
 * Not wired to a scheduler yet — Vercel Cron and Supabase scheduled
 * functions both need repo-root / project config this stream doesn't own
 * (`vercel.json`, Supabase dashboard). Suggested wiring for whoever owns
 * that: a Vercel Cron entry hitting `POST /api/jobs/process-events` every
 * 1-2 minutes. See this stream's final report for the exact suggestion.
 *
 * Auth: the caller must send `Authorization: Bearer <CRON_SECRET>` (Vercel
 * Cron's own convention). In production `CRON_SECRET` is REQUIRED — if it's
 * unset the route fails closed (503) rather than exposing an unauthenticated
 * trigger for push fan-out and outbox writes. Outside production the check is
 * skipped when the env var is unset so local/dev testing doesn't require it.
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

  const result = await processAppEvents();
  return NextResponse.json(result);
}
