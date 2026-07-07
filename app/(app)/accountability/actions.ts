"use server";

/**
 * Server actions for Accountability (ARCHITECTURE.md "Infractions &
 * Accountability"). Follows the People/Teams permission-guard pattern (see
 * app/(app)/people/actions.ts): every action calls requirePermission() before
 * any DB write, mutations go through the per-request client so RLS
 * independently re-checks has_permission()/row ownership (supabase/
 * migrations/20260707030000_accountability_rls.sql), and actions return a
 * discriminated ActionResult instead of throwing.
 *
 * Two deliberate exceptions use createServiceRoleClient() (the same "one
 * exception" pattern people/actions.ts uses for inviteUser), both only ever
 * after a requirePermission()/ownership check has already passed:
 *  1. issueInfraction's threshold check reads the recipient's full infraction
 *     history and writes disciplinary_actions -- a leader with only
 *     accountability.issue (not accountability.manage) cannot read the base
 *     `infractions` table under RLS (manager-only SELECT, by design -- see
 *     the anonymity rule below), but escalation math is system logic that
 *     has to run regardless of the issuing leader's own read access.
 *  2. acknowledgeDisciplinaryAction lets a user acknowledge their OWN action
 *     without a general self-UPDATE RLS policy, which would otherwise let a
 *     user rewrite their own `status`/`note` directly (RLS restricts rows,
 *     not columns).
 *
 * Idempotency (PLAN.md ground rules): issueInfraction short-circuits a
 * near-duplicate double-submit (see logic.ts isLikelyDuplicateSubmission),
 * acknowledgeDisciplinaryAction is a no-op once already acknowledged, and
 * findNewlyTriggeredThresholds (logic.ts) never re-fires a rung already
 * triggered within the current rolling window.
 *
 * Privacy rule (ARCHITECTURE.md "Discord integration"): emitted event
 * payloads below deliberately omit `points` and any note text -- infractions
 * and disciplinary actions never auto-post except the specced leaders-only
 * channel with no point details, and the safest way to guarantee that no
 * consumer (S10) can accidentally leak details is to not put them on the
 * event in the first place.
 */

import { revalidatePath } from "next/cache";

import { emitEvent } from "@/lib/events/bus";
import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/accountability/action-types";
import {
  computeActivePoints,
  computeExpiresAt,
  findNewlyTriggeredThresholds,
  isLikelyDuplicateSubmission,
} from "@/app/(app)/accountability/logic";
import {
  acknowledgeDisciplinaryActionSchema,
  deleteByIdSchema,
  issueInfractionSchema,
  updateAccountabilitySettingsSchema,
  upsertDisciplinaryActionTypeSchema,
  upsertInfractionTypeSchema,
  type AcknowledgeDisciplinaryActionInput,
  type DeleteByIdInput,
  type IssueInfractionInput,
  type UpdateAccountabilitySettingsInput,
  type UpsertDisciplinaryActionTypeInput,
  type UpsertInfractionTypeInput,
} from "@/app/(app)/accountability/validation";

function toActionError(error: unknown): string {
  if (error instanceof PermissionError) {
    return "You don't have permission to do this.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

function revalidateAccountability() {
  revalidatePath("/accountability");
}

/**
 * Best-effort event emission: the infractions/disciplinary_actions mutations
 * above are the source of truth; event emission is notification-side
 * plumbing consumed by other streams (S10 notifications/Discord). It must
 * never turn a successful write into a reported failure -- known gap (same
 * one the Checklists stream flagged): `app_events` has no RLS policy yet, so
 * emitEvent can currently throw for every caller until that's added.
 */
async function emitEventSafely(...args: Parameters<typeof emitEvent>): Promise<void> {
  try {
    await emitEvent(...args);
  } catch (error) {
    console.error(`accountability: emitEvent(${args[0]}) failed`, error);
  }
}

/**
 * Issues an infraction to a recipient. Requires accountability.issue (or
 * accountability.manage). Computes the expiry from the store's accountability
 * period, writes the infraction, then checks whether the recipient's active
 * points just crossed a new disciplinary threshold and records the action if
 * so.
 */
export async function issueInfraction(
  input: IssueInfractionInput,
): Promise<ActionResult<{ infractionId: string; triggeredActionTypeIds: string[] }>> {
  try {
    await requirePermission("accountability.issue");

    const parsed = issueInfractionSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "You must be signed in to do this." };
    }

    const { data: type, error: typeError } = await supabase
      .from("infraction_types")
      .select("id, points, active")
      .eq("id", parsed.typeId)
      .maybeSingle();
    if (typeError) return { ok: false, error: typeError.message };
    if (!type || !type.active) {
      return { ok: false, error: "That infraction type is not available." };
    }

    const { data: settings } = await supabase
      .from("accountability_settings")
      .select("period_kind, period_days")
      .maybeSingle();
    const periodSettings = settings ?? { period_kind: "rolling", period_days: 60 };

    const note = parsed.note ? parsed.note : null;

    // Idempotency: a double-click / retried submit shouldn't create two
    // infractions for what the UI intended as one. Check for a very recent
    // matching row from the same issuer before inserting.
    const { data: recent, error: recentError } = await supabase
      .from("infractions")
      .select("id, issued_at, note")
      .eq("user_id", parsed.userId)
      .eq("type_id", parsed.typeId)
      .eq("issued_by", user.id)
      .order("issued_at", { ascending: false })
      .limit(1);
    if (recentError) return { ok: false, error: recentError.message };

    const now = new Date();
    const duplicate = (recent ?? []).find(
      (r) => r.note === note && isLikelyDuplicateSubmission(r, now),
    );

    let infractionId: string;
    if (duplicate) {
      infractionId = duplicate.id;
    } else {
      const expiresAt = computeExpiresAt(now, periodSettings);
      const { data: inserted, error: insertError } = await supabase
        .from("infractions")
        .insert({
          user_id: parsed.userId,
          type_id: parsed.typeId,
          points: type.points,
          note,
          issued_by: user.id,
          issued_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .select("id")
        .single();
      if (insertError) return { ok: false, error: insertError.message };
      infractionId = inserted.id;

      await emitEventSafely("infraction_issued", {
        infractionId,
        userId: parsed.userId,
      });
    }

    // Threshold check needs the recipient's full infraction history, which a
    // leader with only accountability.issue cannot read under RLS (see the
    // module doc comment above) -- service-role client for this system
    // computation only.
    const admin = createServiceRoleClient();
    const [{ data: allInfractions, error: allError }, { data: ladder, error: ladderError }] =
      await Promise.all([
        admin.from("infractions").select("points, expires_at").eq("user_id", parsed.userId),
        admin
          .from("disciplinary_action_types")
          .select("id, threshold_points")
          .order("threshold_points", { ascending: true }),
      ]);
    if (allError) return { ok: false, error: allError.message };
    if (ladderError) return { ok: false, error: ladderError.message };

    const activePoints = computeActivePoints(allInfractions ?? [], now);

    const { data: existingActions, error: existingError } = await admin
      .from("disciplinary_actions")
      .select("type_id, triggered_at")
      .eq("user_id", parsed.userId);
    if (existingError) return { ok: false, error: existingError.message };

    const triggered = findNewlyTriggeredThresholds(
      activePoints,
      ladder ?? [],
      existingActions ?? [],
      now,
      periodSettings.period_days,
    );

    for (const rung of triggered) {
      const { error: triggerError } = await admin.from("disciplinary_actions").insert({
        user_id: parsed.userId,
        type_id: rung.id,
        status: "pending",
        triggered_at: now.toISOString(),
      });
      if (triggerError) return { ok: false, error: triggerError.message };
      await emitEventSafely("disciplinary_triggered", {
        userId: parsed.userId,
        typeId: rung.id,
      });
    }

    revalidateAccountability();
    return {
      ok: true,
      data: { infractionId, triggeredActionTypeIds: triggered.map((t) => t.id) },
    };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Self-service acknowledgement of one's own disciplinary action, or a manager
 * acknowledging on someone's behalf. Uses the service-role client to write
 * only `status`/`acknowledged_at` after an explicit ownership/permission
 * check -- see the module doc comment for why this can't be a plain RLS
 * self-UPDATE policy. Idempotent: a no-op if already acknowledged.
 */
export async function acknowledgeDisciplinaryAction(
  input: AcknowledgeDisciplinaryActionInput,
): Promise<ActionResult> {
  try {
    const parsed = acknowledgeDisciplinaryActionSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "You must be signed in to do this." };
    }

    // Readable via disciplinary_actions_select_self_or_manager RLS policy.
    const { data: action, error: actionError } = await supabase
      .from("disciplinary_actions")
      .select("id, user_id, status")
      .eq("id", parsed.id)
      .maybeSingle();
    if (actionError) return { ok: false, error: actionError.message };
    if (!action) return { ok: false, error: "Disciplinary action not found." };

    const isOwner = action.user_id === user.id;
    if (!isOwner) {
      await requirePermission("accountability.manage");
    }

    if (action.status === "acknowledged") {
      return { ok: true, data: undefined };
    }

    const admin = createServiceRoleClient();
    const { error: updateError } = await admin
      .from("disciplinary_actions")
      .update({ status: "acknowledged", acknowledged_at: new Date().toISOString() })
      .eq("id", parsed.id);
    if (updateError) return { ok: false, error: updateError.message };

    revalidateAccountability();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Creates or edits an infraction type. Admin-only (accountability.manage). */
export async function upsertInfractionType(
  input: UpsertInfractionTypeInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("accountability.manage");
    const parsed = upsertInfractionTypeSchema.parse(input);
    const supabase = await createClient();

    const row = {
      name: parsed.name,
      points: parsed.points,
      description: parsed.description ? parsed.description : null,
      active: parsed.active,
    };

    if (parsed.id) {
      const { error } = await supabase.from("infraction_types").update(row).eq("id", parsed.id);
      if (error) return { ok: false, error: error.message };
      revalidateAccountability();
      return { ok: true, data: { id: parsed.id } };
    }

    const { data, error } = await supabase
      .from("infraction_types")
      .insert(row)
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    revalidateAccountability();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Deletes an infraction type. Admin-only; blocked by the FK if still referenced. */
export async function deleteInfractionType(input: DeleteByIdInput): Promise<ActionResult> {
  try {
    await requirePermission("accountability.manage");
    const parsed = deleteByIdSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("infraction_types").delete().eq("id", parsed.id);
    if (error) return { ok: false, error: error.message };

    revalidateAccountability();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Creates or edits a disciplinary ladder rung. Admin-only (accountability.manage). */
export async function upsertDisciplinaryActionType(
  input: UpsertDisciplinaryActionTypeInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("accountability.manage");
    const parsed = upsertDisciplinaryActionTypeSchema.parse(input);
    const supabase = await createClient();

    const row = {
      name: parsed.name,
      threshold_points: parsed.thresholdPoints,
      description: parsed.description ? parsed.description : null,
      sort: parsed.sort,
    };

    if (parsed.id) {
      const { error } = await supabase
        .from("disciplinary_action_types")
        .update(row)
        .eq("id", parsed.id);
      if (error) return { ok: false, error: error.message };
      revalidateAccountability();
      return { ok: true, data: { id: parsed.id } };
    }

    const { data, error } = await supabase
      .from("disciplinary_action_types")
      .insert(row)
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    revalidateAccountability();
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Deletes a disciplinary ladder rung. Admin-only; blocked by the FK if still referenced. */
export async function deleteDisciplinaryActionType(
  input: DeleteByIdInput,
): Promise<ActionResult> {
  try {
    await requirePermission("accountability.manage");
    const parsed = deleteByIdSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("disciplinary_action_types")
      .delete()
      .eq("id", parsed.id);
    if (error) return { ok: false, error: error.message };

    revalidateAccountability();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Updates the store's accountability period (rolling vs fixed, length in days). Admin-only. */
export async function updateAccountabilitySettings(
  input: UpdateAccountabilitySettingsInput,
): Promise<ActionResult> {
  try {
    await requirePermission("accountability.manage");
    const parsed = updateAccountabilitySettingsSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from("accountability_settings")
      .update({ period_kind: parsed.periodKind, period_days: parsed.periodDays })
      .eq("id", parsed.id);
    if (error) return { ok: false, error: error.message };

    revalidateAccountability();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
