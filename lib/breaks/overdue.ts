import { revalidatePath } from "next/cache";

import { emitEvent } from "@/lib/events/bus";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Scans authorized breaks past the overdue grace window and flips them to
 * 'overdue', emitting one break_overdue event per newly-overdue break.
 *
 * FIQ-18: this is a service-role, RLS-bypassing mutation whose only auth
 * boundary is the cron route's shared secret. It deliberately lives in this
 * plain (non-"use server") lib module rather than in app/(app)/breaks/
 * actions.ts, so it can never be pulled into the client server-action graph
 * and invoked without that secret. The cron route (app/api/cron/
 * breaks-overdue/route.ts) is its only caller. Mirrors how the other cron
 * routes keep their service-role work out of "use server" files.
 *
 * Idempotent: only breaks currently in 'authorized' are considered, and the
 * .eq('status','authorized') filter on the update guards a concurrent
 * double-run, so an already-overdue break is never re-emitted.
 */
export async function markOverdueBreaks(): Promise<{ flagged: number }> {
  const supabase = createServiceRoleClient();
  const now = new Date();

  const { data: authorizedBreaks } = await supabase
    .from("breaks")
    .select("id, status, authorized_at, setup_id, user_id")
    .eq("status", "authorized");

  let flagged = 0;
  for (const breakRow of authorizedBreaks ?? []) {
    if (!breakRow.authorized_at) continue;
    const elapsedMinutes = (now.getTime() - new Date(breakRow.authorized_at).getTime()) / 60_000;
    if (elapsedMinutes <= 10) continue;

    const { data: claimed, error } = await supabase
      .from("breaks")
      .update({ status: "overdue" })
      .eq("id", breakRow.id)
      .eq("status", "authorized") // guards a concurrent double-run race
      .select("id");

    // Only emit if THIS run actually flipped the row. A 0-row update
    // (concurrent run already flagged it) returns no error, so without the
    // claimed-rows check both runs would emit break_overdue for the same
    // break — and break_overdue fans out to notifications/Discord.
    if (!error && claimed && claimed.length > 0) {
      flagged += 1;
      await emitEvent("break_overdue", {
        break_id: breakRow.id,
        setup_id: breakRow.setup_id,
        user_id: breakRow.user_id,
      });
    }
  }

  if (flagged > 0) {
    revalidatePath("/breaks");
    revalidatePath("/setups");
  }
  return { flagged };
}
