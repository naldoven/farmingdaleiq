/**
 * Scheduled function: flags authorized-but-not-started breaks as overdue
 * and emits `break_overdue` (ARCHITECTURE.md "Breaks — compliance engine":
 * "Overdue/missed breaks alert the shift leader in real time"; "Technical
 * architecture": "pg_cron / scheduled functions... overdue task flags").
 *
 * How to schedule (pick one — neither is wired up by this stream; this is
 * the route the orchestrator/P2 points a scheduler at):
 *   1. Vercel Cron (vercel.json crons entry) hitting this route on an
 *      interval (e.g. every 5 minutes), with CRON_SECRET set as a Vercel
 *      env var and sent as the `Authorization: Bearer <secret>` header.
 *   2. Supabase pg_cron + pg_net calling this URL on a schedule with the
 *      same header.
 * vercel.json isn't owned by this stream (shared config), so it isn't
 * added here — noted as a P2/deploy-checklist follow-up instead.
 *
 * Auth: a shared-secret header, not a signed-in user — cron calls don't
 * have a session. Fails closed (403) if CRON_SECRET isn't configured.
 */

import { NextResponse } from "next/server";

import { markOverdueBreaks } from "@/lib/breaks/overdue";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 403 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const result = await markOverdueBreaks();
  return NextResponse.json(result);
}

export const dynamic = "force-dynamic";
