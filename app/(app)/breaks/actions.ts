"use server";

/**
 * Server actions for /breaks: generating the day's break plan from a posted
 * setup, and the authorize -> start -> complete lifecycle
 * (ARCHITECTURE.md "Breaks — compliance engine"). All status transitions go
 * through lib/breaks/entitlement.ts's canTransition() so a double-submitted
 * click (e.g. mashing "Authorize" twice) is a no-op instead of an error or a
 * duplicate side effect.
 */

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import {
  buildBreakPlan,
  canTransition,
  computeShiftMinutes,
  type BreakStatus,
} from "@/lib/breaks/entitlement";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { storeDateTimeInputToIso } from "@/lib/time";
import type { ActionResult } from "@/app/(app)/breaks/action-types";
import {
  authorizeBreakSchema,
  completeBreakSchema,
  generateBreaksSchema,
  startBreakSchema,
} from "@/app/(app)/breaks/validation";

function revalidateBreaks() {
  revalidatePath("/breaks");
  revalidatePath("/setups");
}

function combineDateAndTime(date: string, time: string): Date {
  const iso = storeDateTimeInputToIso(`${date}T${time}`);
  return iso ? new Date(iso) : new Date(`${date}T${time}Z`);
}

/**
 * Builds and inserts the break plan for a posted setup. Called
 * automatically from app/(app)/setups/actions.ts's postSetup(), and safe to
 * call again by hand (e.g. after an assignment change). Idempotent two ways:
 * only inserts a break row for a (user, kind) pair that doesn't already have
 * one on ANY setup for the same date (one scheduled shift earns one break,
 * however many day-part setups it spans), and the insert itself is an upsert
 * against breaks_setup_user_kind_uq so two leaders refreshing at the same
 * moment cannot both insert the same entitlement.
 */
export async function generateBreaksForSetup(
  setupId: string,
): Promise<ActionResult<{ inserted: number }>> {
  try {
    // Defense in depth: this is called internally by postSetup() (which
    // already required setups.post), but guard it independently in case a
    // future caller invokes it directly. Every role that holds setups.post
    // also holds breaks.manage in the seeded permission tiers (supabase/
    // migrations/20260707001900_seed_store_config.sql's leader_keys), so
    // this never blocks a legitimate poster.
    await requirePermission("breaks.manage");
    const parsed = generateBreaksSchema.parse({ setupId });
    const supabase = await createClient();

    const { data: setup, error: setupError } = await supabase
      .from("setups")
      .select("id, date, day_part_id")
      .eq("id", parsed.setupId)
      .single();

    if (setupError || !setup) {
      return { ok: false, error: setupError?.message ?? "Setup not found." };
    }

    const { data: dayPart } = setup.day_part_id
      ? await supabase
          .from("day_parts")
          .select("start_time, end_time")
          .eq("id", setup.day_part_id)
          .maybeSingle()
      : { data: null };

    const { data: assignments } = await supabase
      .from("setup_assignments")
      .select("user_id, arrival_time, scheduled_end")
      .eq("setup_id", parsed.setupId)
      .not("user_id", "is", null);

    const userIds = [...new Set((assignments ?? []).map((a) => a.user_id).filter(Boolean))] as string[];
    if (userIds.length === 0) {
      return { ok: true, data: { inserted: 0 } };
    }

    // PPL2b: birthdate moved to the locked profiles_private table. The break
    // plan needs each assignee's birthdate to apply minor break rules (a
    // labor-compliance input), and breaks.manage is not people.manage, so read
    // it past RLS with the service-role client. The value only feeds the plan;
    // it is never returned to the client.
    const admin = createServiceRoleClient();
    const { data: privateRows } = await admin
      .from("profiles_private")
      .select("profile_id, birthdate")
      .in("profile_id", userIds);
    const birthdateByUser = new Map(
      (privateRows ?? []).map((p) => [p.profile_id, p.birthdate]),
    );

    const { data: rules } = await supabase.from("break_rules").select("*");

    const now = new Date();
    const dayPartEnd = dayPart ? combineDateAndTime(setup.date, dayPart.end_time) : null;
    const dayPartStart = dayPart ? combineDateAndTime(setup.date, dayPart.start_time) : null;

    const shiftAssignments = (assignments ?? [])
      .filter(
        (a): a is { user_id: string; arrival_time: string | null; scheduled_end: string | null } =>
          Boolean(a.user_id),
      )
      .map((a) => ({
        userId: a.user_id,
        arrivalTime: a.arrival_time ? new Date(a.arrival_time) : null,
        birthdate: birthdateByUser.get(a.user_id) ?? null,
        // Scheduled shift length (lib/breaks/entitlement.ts computeShiftMinutes):
        // arrival -> scheduled_end, falling back to the day-part window.
        shiftMinutes: computeShiftMinutes({
          arrival: a.arrival_time ? new Date(a.arrival_time) : null,
          scheduledEnd: a.scheduled_end ? new Date(a.scheduled_end) : null,
          dayPartStart,
          dayPartEnd,
        }),
      }));

    const plan = buildBreakPlan(shiftAssignments, rules ?? [], now);

    // One shift, one entitlement: a person assigned on the Lunch AND Dinner
    // setups of the same date works one scheduled shift, so a break already
    // planned on any setup for that date counts. Same-date setups include this
    // one, so this also covers the plain re-run case.
    const { data: sameDaySetups } = await supabase.from("setups").select("id").eq("date", setup.date);
    const sameDaySetupIds = [...new Set([parsed.setupId, ...(sameDaySetups ?? []).map((s) => s.id)])];
    const { data: existingBreaks } = await supabase
      .from("breaks")
      .select("user_id, kind")
      .in("setup_id", sameDaySetupIds);
    const existingKeys = new Set((existingBreaks ?? []).map((b) => `${b.user_id}:${b.kind}`));

    const toInsert = plan
      .filter((p) => !existingKeys.has(`${p.userId}:${p.kind}`))
      .map((p) => ({
        setup_id: parsed.setupId,
        user_id: p.userId,
        rule_id: p.ruleId,
        kind: p.kind,
        sequence: p.sequence,
        status: "pending" as const,
      }));

    if (toInsert.length > 0) {
      // ignoreDuplicates: a concurrent run that already inserted the same
      // (setup, user, kind) wins and this insert silently skips it, instead
      // of surfacing a 23505 to the leader who clicked second.
      const { error: insertError } = await supabase
        .from("breaks")
        .upsert(toInsert, { onConflict: "setup_id,user_id,kind", ignoreDuplicates: true });
      if (insertError) return { ok: false, error: insertError.message };
    }

    revalidateBreaks();
    return { ok: true, data: { inserted: toInsert.length } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

async function transitionBreak(
  id: string,
  to: BreakStatus,
  timestampField: "authorized_at" | "started_at" | "ended_at" | null,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: current, error: fetchError } = await supabase
    .from("breaks")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchError || !current) {
    return { ok: false, error: fetchError?.message ?? "Break not found." };
  }

  if (current.status === to) {
    // Already in the target state — idempotent no-op (double-submit safe).
    return { ok: true, data: undefined };
  }

  if (!canTransition(current.status, to)) {
    return { ok: false, error: `Can't move a break from ${current.status} to ${to}.` };
  }

  const update: {
    status: BreakStatus;
    authorized_at?: string;
    started_at?: string;
    ended_at?: string;
  } = { status: to };
  if (timestampField) update[timestampField] = new Date().toISOString();

  // Compare-and-swap on the status we just validated against. Without it two
  // leaders acting at once (one taps Start, the other Complete a moment
  // later) could both pass canTransition() on a stale read and the later
  // write would overwrite the earlier one, skipping a state and stamping the
  // wrong timestamp. Same guard the cron sweep (lib/breaks/overdue.ts) and
  // postSetup() use.
  const { data: claimed, error } = await supabase
    .from("breaks")
    .update(update)
    .eq("id", id)
    .eq("status", current.status)
    .select("id");
  if (error) return { ok: false, error: error.message };

  if (!claimed || claimed.length === 0) {
    // Lost the race. If the other writer landed the same target state this is
    // still a successful no-op; otherwise tell the leader to look again.
    const { data: latest } = await supabase.from("breaks").select("status").eq("id", id).maybeSingle();
    if (latest?.status === to) return { ok: true, data: undefined };
    return {
      ok: false,
      error: `This break just changed to ${latest?.status ?? "another state"}. Refresh and try again.`,
    };
  }

  revalidateBreaks();
  return { ok: true, data: undefined };
}

export async function authorizeBreak(
  input: z.infer<typeof authorizeBreakSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("breaks.manage");
    const parsed = authorizeBreakSchema.parse(input);
    return await transitionBreak(parsed.id, "authorized", "authorized_at");
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function startBreak(
  input: z.infer<typeof startBreakSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("breaks.manage");
    const parsed = startBreakSchema.parse(input);
    return await transitionBreak(parsed.id, "active", "started_at");
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function completeBreak(
  input: z.infer<typeof completeBreakSchema>,
): Promise<ActionResult> {
  try {
    await requirePermission("breaks.manage");
    const parsed = completeBreakSchema.parse(input);
    return await transitionBreak(parsed.id, "completed", "ended_at");
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

// markOverdueBreaks moved to lib/breaks/overdue.ts (FIQ-18): it is a
// service-role, RLS-bypassing mutation and must not live in this "use server"
// module, where it would be reachable from the client action graph. Its only
// caller is app/api/cron/breaks-overdue/route.ts.
