import { NextRequest, NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";

import { runDriverReminders } from "./reminders";

/**
 * Driver reservation reminders, every minute (vercel.json). Its own route
 * rather than a step in /api/cron/catering, so a failure in the setup build
 * there can never stop a reminder here, and the other way round.
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

  const result = await runDriverReminders(createServiceRoleClient(), new Date());
  return NextResponse.json({ ok: result.status !== "error", ...result }, { status: result.status === "error" ? 500 : 200 });
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
