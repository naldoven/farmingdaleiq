import { revalidatePath } from "next/cache";

import { isMissed } from "@/lib/breaks/entitlement";
import { emitEvent } from "@/lib/events/bus";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Scans authorized breaks past the overdue grace window and flips them to
 * 'overdue', emitting one break_overdue event per newly-overdue break. Then
 * scans every still-open break (pending/authorized/overdue) whose setup's
 * day-part has ended and flips those to 'missed' (HIGH parity-audit finding:
 * `isMissed()` had zero callers, so an unauthorized break sat 'pending'
 * forever instead of ever resolving).
 *
 * FIQ-18: this is a service-role, RLS-bypassing mutation whose only auth
 * boundary is the cron route's shared secret. It deliberately lives in this
 * plain (non-"use server") lib module rather than in app/(app)/breaks/
 * actions.ts, so it can never be pulled into the client server-action graph
 * and invoked without that secret. The cron route (app/api/cron/
 * breaks-overdue/route.ts) is its only caller. Mirrors how the other cron
 * routes keep their service-role work out of "use server" files.
 *
 * Idempotent: only breaks currently in 'authorized' are considered for the
 * overdue sweep, and the .eq('status','authorized') filter on the update
 * guards a concurrent double-run, so an already-overdue break is never
 * re-emitted. Same pattern for the missed sweep, guarded per starting
 * status.
 */
export async function markOverdueBreaks(): Promise<{ flagged: number; missed: number }> {
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

  const missed = await markMissedBreaks(supabase, now);

  if (flagged > 0 || missed > 0) {
    revalidatePath("/breaks");
    revalidatePath("/setups");
  }
  return { flagged, missed };
}

/**
 * Flips pending/authorized/overdue breaks to 'missed' once their setup's
 * day-part end has passed. A setup with no day_part_id (an "any day-part"
 * setup) has no end time to compare against, so its breaks are left alone —
 * there's nothing to compute "missed at day-part end" from.
 */
async function markMissedBreaks(
  supabase: ReturnType<typeof createServiceRoleClient>,
  now: Date,
): Promise<number> {
  const { data: openBreaks } = await supabase
    .from("breaks")
    .select("id, status, setup_id, user_id")
    .in("status", ["pending", "authorized", "overdue"]);

  if (!openBreaks || openBreaks.length === 0) return 0;

  const setupIds = [...new Set(openBreaks.map((b) => b.setup_id).filter((id): id is string => Boolean(id)))];
  const { data: setups } = setupIds.length
    ? await supabase.from("setups").select("id, date, day_part_id").in("id", setupIds)
    : { data: [] };
  const setupById = new Map((setups ?? []).map((s) => [s.id, s]));

  const dayPartIds = [
    ...new Set((setups ?? []).map((s) => s.day_part_id).filter((id): id is string => Boolean(id))),
  ];
  const { data: dayParts } = dayPartIds.length
    ? await supabase.from("day_parts").select("id, end_time").in("id", dayPartIds)
    : { data: [] };
  const endTimeByDayPart = new Map((dayParts ?? []).map((d) => [d.id, d.end_time]));

  let missed = 0;
  for (const breakRow of openBreaks) {
    const setup = breakRow.setup_id ? setupById.get(breakRow.setup_id) : null;
    const endTime = setup?.day_part_id ? endTimeByDayPart.get(setup.day_part_id) : null;
    if (!setup || !endTime) continue; // no day-part end to compute "missed at day-part end" from

    const shiftEnd = new Date(`${setup.date}T${endTime}`);
    if (Number.isNaN(shiftEnd.getTime())) continue;
    if (!isMissed({ status: breakRow.status, authorized_at: null }, shiftEnd, now)) continue;

    const { data: claimed, error } = await supabase
      .from("breaks")
      .update({ status: "missed" })
      .eq("id", breakRow.id)
      .eq("status", breakRow.status) // guards a concurrent double-run race
      .select("id");

    if (!error && claimed && claimed.length > 0) {
      missed += 1;
      // Reuses break_overdue's routing (ARCHITECTURE.md "Overdue &
      // incomplete -> leaders channel"): a missed break is the same class of
      // compliance alert as an overdue one, and `break_missed` isn't a
      // registered event key (lib/events/bus.ts's EVENT_KEYS is a
      // cross-module contract this stream doesn't own — see the parity-audit
      // report for the follow-up to add a dedicated key).
      await emitEvent("break_overdue", {
        break_id: breakRow.id,
        setup_id: breakRow.setup_id,
        user_id: breakRow.user_id,
        status: "missed",
      });
    }
  }

  return missed;
}
