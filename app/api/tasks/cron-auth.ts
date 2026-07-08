import type { NextRequest } from "next/server";

/**
 * Shared cron authorization for the Tasks scheduled routes. Mirrors the sibling
 * cron routes (app/api/cron/*): Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`, so the secret is checked against that
 * header. Fails CLOSED — a missing `CRON_SECRET` rejects every request rather
 * than leaving the endpoint publicly triggerable.
 */
export function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
