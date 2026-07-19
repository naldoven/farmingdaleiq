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
 * Deliberate exceptions use createServiceRoleClient() (the same "one
 * exception" pattern people/actions.ts uses for inviteUser), each only ever
 * after a requirePermission()/ownership check has already passed:
 *  1. issueInfraction's double-submit duplicate check AND its threshold
 *     check both read the recipient's full infraction history (and the
 *     threshold check also writes disciplinary_actions) -- a leader with
 *     only accountability.issue (not accountability.manage) cannot read the
 *     base `infractions` table under RLS (manager-only SELECT, by design --
 *     see the anonymity rule below). Running either check on the
 *     per-request client silently returns 0 rows for that caller (RLS
 *     filters rows, it doesn't error), which is exactly how the duplicate
 *     guard used to go dark for the two roles that actually issue
 *     infractions. Both checks are system logic that has to run regardless
 *     of the issuing leader's own read access, hence the service-role client.
 *  2. acknowledgeDisciplinaryAction lets a user acknowledge their OWN action
 *     without a general self-UPDATE RLS policy, which would otherwise let a
 *     user rewrite their own `status`/`note` directly (RLS restricts rows,
 *     not columns).
 *
 * Idempotency (PLAN.md ground rules): issueInfraction short-circuits a
 * near-duplicate double-submit (see logic.ts isLikelyDuplicateSubmission),
 * acknowledgeDisciplinaryAction is a no-op once already acknowledged, and
 * findNewlyTriggeredThresholds (logic.ts) never re-fires a rung that still
 * has an unresolved ('pending') disciplinary action open for it.
 *
 * issueInfraction also rejects self-issuance server-side (parsed.userId ===
 * the caller's own id) -- the issue-form UI already excludes the caller from
 * the recipient picker, but that's cosmetic only; a direct action call must
 * be blocked the same way regardless of what the UI shows.
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
 * never turn a successful write into a reported failure -- `app_events` now
 * carries an RLS insert policy scoped per event key (supabase/migrations/
 * 20260707080100_app_events_rls_hardening.sql covers infraction_issued and
 * disciplinary_triggered), but emitEvent is still wrapped defensively here so
 * a transient notification-layer failure (or a future policy change) can
 * never turn the infraction/disciplinary write above into a reported error.
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

    // No server-side guard previously existed against a leader issuing
    // points to themselves -- only the issue-form UI filtered the caller out
    // of the recipient picker, which a direct action call bypasses entirely.
    if (parsed.userId === user.id) {
      return { ok: false, error: "You cannot issue an infraction to yourself." };
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

    // The threshold check below needs the recipient's full infraction
    // history, which a leader with only accountability.issue cannot read
    // under RLS (see the module doc comment above) -- service-role client
    // for system computations that must run regardless of the issuing
    // leader's own read access.
    const admin = createServiceRoleClient();

    // Idempotency: a double-click / retried submit shouldn't create two
    // infractions for what the UI intended as one. Check for a very recent
    // matching row from the same issuer before inserting. This MUST run on
    // the service-role client: the only SELECT policy on `infractions`
    // requires accountability.manage (the anonymity rule keeps ordinary
    // issuers from reading the base table), so Team Leader/Shift Supervisor
    // callers -- who hold only accountability.issue -- previously ran this
    // check on the per-request client, got 0 rows back every time (RLS
    // silently filters rather than erroring), and never detected an actual
    // double-submit.
    const { data: recent, error: recentError } = await admin
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
      // ACC1 fix: insert on the service-role `admin` client, not the
      // per-request `supabase` client. The insert uses `.select("id")`
      // (RETURNING), and the only SELECT policy on `infractions` requires
      // accountability.manage. An issue-only actor (Team Leader / Shift
      // Supervisor holds accountability.issue but NOT accountability.manage)
      // therefore failed the RETURNING read under RLS, rolling back the whole
      // insert — issuing an infraction was dead for exactly the two roles that
      // do it. requirePermission("accountability.issue") + the self-issuance
      // block above already authorize this write; `admin` is the same client
      // the dedup/threshold reads below already use for the same reason.
      const { data: inserted, error: insertError } = await admin
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
      .select("type_id, triggered_at, status")
      .eq("user_id", parsed.userId);
    if (existingError) return { ok: false, error: existingError.message };

    const triggered = findNewlyTriggeredThresholds(
      activePoints,
      ladder ?? [],
      existingActions ?? [],
    );

    // ACC2: findNewlyTriggeredThresholds is a read-then-insert with no lock, so
    // two infractions issued concurrently could both see the same rung as
    // "newly crossed" and each try to open a pending disciplinary_action for it
    // (a duplicate write-up). The new partial unique index
    // disciplinary_actions_pending_uq (user_id, type_id) where status='pending'
    // (supabase/migrations/20260718000600_disciplinary_actions_pending_uq.sql)
    // makes the loser of that race collide with 23505; we swallow it as a no-op
    // (the rung is already open) rather than erroring, and we don't re-emit the
    // disciplinary_triggered event for a rung we didn't actually open, so the
    // notification/Discord fan-out isn't duplicated either.
    const openedRungIds: string[] = [];
    for (const rung of triggered) {
      const { error: triggerError } = await admin.from("disciplinary_actions").insert({
        user_id: parsed.userId,
        type_id: rung.id,
        status: "pending",
        triggered_at: now.toISOString(),
      });
      if (triggerError) {
        if (triggerError.code === "23505") {
          // A concurrent issue already opened this exact pending rung — no-op.
          continue;
        }
        return { ok: false, error: triggerError.message };
      }
      openedRungIds.push(rung.id);
      await emitEventSafely("disciplinary_triggered", {
        userId: parsed.userId,
        typeId: rung.id,
      });
    }

    revalidateAccountability();
    return {
      ok: true,
      data: { infractionId, triggeredActionTypeIds: openedRungIds },
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
