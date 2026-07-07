/**
 * Pure business logic for Accountability (ARCHITECTURE.md "Infractions &
 * Accountability"). Kept free of Supabase/Next imports so it is unit-testable
 * without a DB and safely importable from both server actions/pages and the
 * nightly cron route (app/api/cron/accountability/route.ts).
 */

export const PERIOD_KINDS = ["rolling", "fixed"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export interface AccountabilitySettingsLike {
  period_kind: string;
  period_days: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Computes `expires_at` for a newly issued infraction.
 *
 * - "rolling" (the live Farmingdale setting: 60 days): expires exactly
 *   `period_days` after issuance -- ARCHITECTURE.md "each infraction's points
 *   expire N days after it was issued."
 * - "fixed": every infraction's points reset together on a shared period
 *   boundary rather than individually. `accountability_settings` has no
 *   separate "period anchor" column, so the boundary is computed as a
 *   `period_days`-length window anchored to the Unix epoch -- this infraction
 *   expires at the end of the window it falls into. Not exercised by the
 *   live store config (seeded "rolling", 60 days) but implemented so the
 *   `period_kind` toggle in the settings form is not a dead option.
 */
export function computeExpiresAt(
  issuedAt: Date,
  settings: AccountabilitySettingsLike,
): Date {
  const days = Math.max(1, Math.floor(settings.period_days) || 1);

  if (settings.period_kind === "fixed") {
    const windowMs = days * DAY_MS;
    const windowIndex = Math.floor(issuedAt.getTime() / windowMs);
    return new Date((windowIndex + 1) * windowMs);
  }

  return new Date(issuedAt.getTime() + days * DAY_MS);
}

export interface InfractionLike {
  points: number;
  expires_at: string | null;
}

/** True if an infraction's points still count toward the active total at `now`. */
export function isInfractionActive(infraction: InfractionLike, now: Date): boolean {
  if (!infraction.expires_at) return true;
  return new Date(infraction.expires_at).getTime() > now.getTime();
}

/** Sums the points of every still-active (non-expired) infraction. */
export function computeActivePoints(
  infractions: InfractionLike[],
  now: Date,
): number {
  return infractions
    .filter((i) => isInfractionActive(i, now))
    .reduce((sum, i) => sum + i.points, 0);
}

export interface DisciplinaryActionTypeLike {
  id: string;
  threshold_points: number;
}

export interface ExistingDisciplinaryActionLike {
  type_id: string;
  triggered_at: string;
}

/**
 * Given a user's active point total and the full disciplinary ladder,
 * decides which rung(s) just got crossed and need a new
 * `disciplinary_actions` row.
 *
 * Idempotent: a rung that already has an action triggered within the current
 * rolling window (`now - period_days`) is skipped, so calling this again
 * after the same infraction -- or after another infraction that doesn't push
 * points past a NEW rung -- never double-fires the same threshold.
 */
export function findNewlyTriggeredThresholds(
  activePoints: number,
  ladder: DisciplinaryActionTypeLike[],
  existingActions: ExistingDisciplinaryActionLike[],
  now: Date,
  periodDays: number,
): DisciplinaryActionTypeLike[] {
  const windowStart = now.getTime() - periodDays * DAY_MS;
  const recentlyTriggeredTypeIds = new Set(
    existingActions
      .filter((a) => new Date(a.triggered_at).getTime() > windowStart)
      .map((a) => a.type_id),
  );

  return ladder
    .filter((t) => t.threshold_points <= activePoints)
    .filter((t) => !recentlyTriggeredTypeIds.has(t.id));
}

export interface PendingDisciplinaryActionLike {
  status: string;
}

/**
 * Nightly expiry sweep decision (the "rolling 60-day expiry job" PLAN.md S6
 * calls for; ARCHITECTURE.md doesn't specify auto-resolution behavior beyond
 * "points expire," so this stream's interpretation -- flagged for product
 * review -- is: a 'pending' disciplinary action auto-resolves once the
 * triggering user's active points have decayed back below the threshold that
 * fired it and nobody acted on it in the meantime). Only ever asked about
 * 'pending' rows -- safe to re-run on an already-resolved row (returns
 * false), so the sweep is idempotent.
 */
export function shouldExpirePendingAction(
  action: PendingDisciplinaryActionLike,
  currentActivePoints: number,
  thresholdPoints: number,
): boolean {
  return action.status === "pending" && currentActivePoints < thresholdPoints;
}

/**
 * Best-effort double-submit guard for `issueInfraction`: treats a
 * same-user/same-type/same-issuer/same-note infraction issued within
 * `windowMs` of `now` as a duplicate submission (form double-click, retried
 * request) rather than a second, deliberate infraction. Not airtight against
 * a true concurrent race (no unique DB constraint backs it -- adding a
 * column/constraint is out of scope per PLAN.md ground rules), but it is
 * enough to make a double-click safe, which is what "safe to run twice"
 * requires for a UI action with no client-supplied idempotency key.
 */
export function isLikelyDuplicateSubmission(
  candidate: { issued_at: string; note: string | null },
  now: Date,
  windowMs = 5000,
): boolean {
  const issuedAt = new Date(candidate.issued_at).getTime();
  return now.getTime() - issuedAt < windowMs;
}
