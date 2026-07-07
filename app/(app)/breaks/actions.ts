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

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import {
  buildBreakPlan,
  canTransition,
  type BreakStatus,
} from "@/lib/breaks/entitlement";
import { emitEvent } from "@/lib/events/bus";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/breaks/action-types";
import {
  authorizeBreakSchema,
  completeBreakSchema,
  generateBreaksSchema,
  startBreakSchema,
} from "@/app/(app)/breaks/validation";

function toActionError(error: unknown): string {
  if (error instanceof PermissionError) {
    return "You don't have permission to do this.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

function revalidateBreaks() {
  revalidatePath("/breaks");
  revalidatePath("/setups");
}

function combineDateAndTime(date: string, time: string): Date {
  return new Date(`${date}T${time}`);
}

/**
 * Builds and inserts the break plan for a posted setup. Called
 * automatically from app/(app)/setups/actions.ts's postSetup(), and safe to
 * call again by hand (e.g. after an assignment change): only inserts a
 * break row for a (user, kind) pair that doesn't already have one for this
 * setup, so re-running never duplicates entitlements.
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
      .select("user_id, arrival_time")
      .eq("setup_id", parsed.setupId)
      .not("user_id", "is", null);

    const userIds = [...new Set((assignments ?? []).map((a) => a.user_id).filter(Boolean))] as string[];
    if (userIds.length === 0) {
      return { ok: true, data: { inserted: 0 } };
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, birthdate")
      .in("id", userIds);
    const birthdateByUser = new Map((profiles ?? []).map((p) => [p.id, p.birthdate]));

    const { data: rules } = await supabase.from("break_rules").select("*");

    const now = new Date();
    const shiftEnd = dayPart ? combineDateAndTime(setup.date, dayPart.end_time) : null;
    const shiftStart = dayPart ? combineDateAndTime(setup.date, dayPart.start_time) : null;

    const shiftAssignments = (assignments ?? [])
      .filter((a): a is { user_id: string; arrival_time: string | null } => Boolean(a.user_id))
      .map((a) => {
        const arrival = a.arrival_time ? new Date(a.arrival_time) : shiftStart;
        const effectiveStart = arrival ?? shiftStart ?? now;
        const shiftMinutes = shiftEnd
          ? Math.max(0, (shiftEnd.getTime() - effectiveStart.getTime()) / 60_000)
          : 0;
        return {
          userId: a.user_id,
          arrivalTime: a.arrival_time ? new Date(a.arrival_time) : null,
          birthdate: birthdateByUser.get(a.user_id) ?? null,
          shiftMinutes,
        };
      });

    const plan = buildBreakPlan(shiftAssignments, rules ?? [], now);

    const { data: existingBreaks } = await supabase
      .from("breaks")
      .select("user_id, kind")
      .eq("setup_id", parsed.setupId);
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
      const { error: insertError } = await supabase.from("breaks").insert(toInsert);
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

  const { error } = await supabase.from("breaks").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

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

/**
 * Scans authorized breaks past the overdue grace window and flips them to
 * 'overdue', emitting one break_overdue event per newly-overdue break.
 * Intended to run on a schedule (see app/api/cron/breaks-overdue/route.ts)
 * with no signed-in user in the request, so it uses the service-role client
 * rather than requirePermission() — the route handler is the auth boundary
 * for this one (a shared-secret header), not a per-request permission
 * check. Idempotent: only breaks currently in 'authorized' are considered,
 * so an already-overdue break is never re-emitted.
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

    const { error } = await supabase
      .from("breaks")
      .update({ status: "overdue" })
      .eq("id", breakRow.id)
      .eq("status", "authorized"); // guards a concurrent double-run race

    if (!error) {
      flagged += 1;
      await emitEvent("break_overdue", {
        break_id: breakRow.id,
        setup_id: breakRow.setup_id,
        user_id: breakRow.user_id,
      });
    }
  }

  if (flagged > 0) revalidateBreaks();
  return { flagged };
}
