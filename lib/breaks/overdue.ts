import { revalidatePath } from "next/cache";

import {
  computeBreakDueAt,
  computeMissedCutoff,
  isMissed,
  isOverdue,
} from "@/lib/breaks/entitlement";
import { emitEvent } from "@/lib/events/bus";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { addStoreCalendarDays, storeDateTimeInputToIso, storeLocalDate } from "@/lib/time";

/**
 * Scans authorized breaks past the overdue grace window and flips them to
 * 'overdue', emitting one break_overdue event per newly-overdue break. Then
 * scans every still-open break (pending/authorized/overdue) on today's and
 * yesterday's setups whose miss cutoff has passed and flips those to 'missed'
 * (see markMissedBreaks; HIGH parity-audit finding:
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
    // Same grace window the board and tests use (OVERDUE_GRACE_MINUTES), not
    // a second hardcoded copy that could drift from it.
    if (!isOverdue(breakRow, now)) continue;

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
 * Flips pending/authorized/overdue breaks to 'missed' once the break can no
 * longer be taken: after the LATER of the person's scheduled_end and the
 * setup's day-part end, and never before the break's own due time
 * (arrival + the rule's min_shift_minutes). See computeMissedCutoff for why
 * the day-part end alone is wrong (an adult due at 12:00 on a Morning setup
 * that ends at 11:00 was being marked missed at the 11:05 tick).
 *
 * Only setups dated today or yesterday (store time) are swept. Yesterday
 * stays in because a late shift or a missed cron tick can leave a break open
 * past midnight. Without the date limit, a setup posted for a past date
 * flipped every break on it to missed on the next tick, one leaders-channel
 * alert each.
 *
 * A setup with no day_part_id (an "any day-part" setup) has no end time to
 * anchor on, so its breaks are left alone.
 */
async function markMissedBreaks(
  supabase: ReturnType<typeof createServiceRoleClient>,
  now: Date,
): Promise<number> {
  const today = storeLocalDate(now);
  const sweepDates = [addStoreCalendarDays(today, -1), today];

  const { data: setups } = await supabase
    .from("setups")
    .select("id, date, day_part_id")
    .in("date", sweepDates);
  if (!setups || setups.length === 0) return 0;
  const setupById = new Map(setups.map((s) => [s.id, s]));

  const { data: openBreaks } = await supabase
    .from("breaks")
    .select("id, status, setup_id, user_id, rule_id")
    .in("status", ["pending", "authorized", "overdue"])
    .in("setup_id", setups.map((s) => s.id));

  if (!openBreaks || openBreaks.length === 0) return 0;

  const dayPartIds = [
    ...new Set(setups.map((s) => s.day_part_id).filter((id): id is string => Boolean(id))),
  ];
  const { data: dayParts } = dayPartIds.length
    ? await supabase.from("day_parts").select("id, end_time").in("id", dayPartIds)
    : { data: [] };
  const endTimeByDayPart = new Map((dayParts ?? []).map((d) => [d.id, d.end_time]));

  const ruleIds = [...new Set(openBreaks.map((b) => b.rule_id).filter((id): id is string => Boolean(id)))];
  const { data: rules } = ruleIds.length
    ? await supabase.from("break_rules").select("id, min_shift_minutes").in("id", ruleIds)
    : { data: [] };
  const minShiftByRule = new Map((rules ?? []).map((r) => [r.id, r.min_shift_minutes]));

  const { data: assignments } = await supabase
    .from("setup_assignments")
    .select("setup_id, user_id, arrival_time, scheduled_end")
    .in("setup_id", [...new Set(openBreaks.map((b) => b.setup_id).filter((id): id is string => Boolean(id)))])
    .not("user_id", "is", null);
  // A person can hold more than one position on a setup. Keep the LATEST
  // arrival and scheduled end so the cutoff errs toward "not missed yet":
  // a late alert is recoverable, a false final 'missed' is not.
  const shiftByPerson = new Map<string, { arrival: Date | null; scheduledEnd: Date | null }>();
  for (const a of assignments ?? []) {
    const key = `${a.setup_id}:${a.user_id}`;
    const prior = shiftByPerson.get(key) ?? { arrival: null, scheduledEnd: null };
    shiftByPerson.set(key, {
      arrival: latestOf(prior.arrival, a.arrival_time),
      scheduledEnd: latestOf(prior.scheduledEnd, a.scheduled_end),
    });
  }

  let missed = 0;
  for (const breakRow of openBreaks) {
    const setup = breakRow.setup_id ? setupById.get(breakRow.setup_id) : null;
    const endTime = setup?.day_part_id ? endTimeByDayPart.get(setup.day_part_id) : null;
    if (!setup || !endTime) continue; // no day-part end to anchor the cutoff on

    const dayPartEndIso = storeDateTimeInputToIso(`${setup.date}T${endTime}`);
    const dayPartEnd = dayPartEndIso ? new Date(dayPartEndIso) : null;
    if (!dayPartEnd || Number.isNaN(dayPartEnd.getTime())) continue;

    const shift = shiftByPerson.get(`${breakRow.setup_id}:${breakRow.user_id}`);
    const minShift = breakRow.rule_id ? minShiftByRule.get(breakRow.rule_id) : undefined;
    const cutoff = computeMissedCutoff({
      dayPartEnd,
      scheduledEnd: shift?.scheduledEnd ?? null,
      dueAt: computeBreakDueAt(
        shift?.arrival ?? null,
        minShift === undefined ? null : { min_shift_minutes: minShift },
      ),
    });
    if (!cutoff) continue;
    if (!isMissed({ status: breakRow.status, authorized_at: null }, cutoff, now)) continue;

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
      // cross-module contract this stream doesn't own, see the parity-audit
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

/** The later of an already-held date and a new ISO timestamp; ignores null and unparseable values. */
function latestOf(current: Date | null, iso: string | null): Date | null {
  if (!iso) return current;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return current;
  return !current || parsed.getTime() > current.getTime() ? parsed : current;
}
