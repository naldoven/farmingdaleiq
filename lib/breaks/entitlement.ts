/**
 * Break compliance engine (ARCHITECTURE.md "Breaks — compliance engine
 * (adopted from OneClick)"). Pure functions only — no Supabase client — so
 * the entitlement math, sequencing, and overdue/missed detection are all
 * unit-testable without a database. Callers (app/(app)/breaks/actions.ts)
 * fetch rows and pass plain data in.
 */

export type AgeBand = "adult" | "minor";

export interface BreakRule {
  id: string;
  min_shift_minutes: number;
  max_shift_minutes: number;
  age_band: string;
  rest_minutes_paid: number;
  meal_minutes_unpaid: number;
  sort: number;
}

export type BreakKind = "rest" | "meal";

export type BreakStatus =
  | "pending"
  | "authorized"
  | "active"
  | "completed"
  | "overdue"
  | "missed";

/** Minors are anyone under 18; a missing birthdate defaults to adult (can't assume minor without data). */
export function ageBandFromBirthdate(birthdate: string | null, now: Date): AgeBand {
  if (!birthdate) return "adult";
  const dob = new Date(birthdate);
  if (Number.isNaN(dob.getTime())) return "adult";

  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age < 18 ? "minor" : "adult";
}

/**
 * Picks the applicable break rule for a shift length + age band. When more
 * than one rule matches the same band (shouldn't normally happen, but the
 * table has no uniqueness constraint), the lowest `sort` wins so seeded
 * "primary" rules (sort 1) beat SEED-DEFAULT fallbacks (sort 10+).
 */
export function selectBreakRule(
  rules: BreakRule[],
  ageBand: AgeBand,
  shiftMinutes: number,
): BreakRule | null {
  const candidates = rules.filter(
    (r) =>
      r.age_band === ageBand &&
      shiftMinutes >= r.min_shift_minutes &&
      shiftMinutes <= r.max_shift_minutes,
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => a.sort - b.sort)[0];
}

export interface PlannedBreak {
  userId: string;
  ruleId: string;
  kind: BreakKind;
  minutes: number;
}

/**
 * Expands a matched rule into the break rows it entitles a person to. A
 * rule can grant a paid rest break, an unpaid meal break, or both (NY minor
 * bands can require both); Farmingdale's live rule today only sets
 * meal_minutes_unpaid, so it expands to a single 'meal' row.
 */
export function expandRuleToBreaks(userId: string, rule: BreakRule): PlannedBreak[] {
  const planned: PlannedBreak[] = [];
  if (rule.rest_minutes_paid > 0) {
    planned.push({ userId, ruleId: rule.id, kind: "rest", minutes: rule.rest_minutes_paid });
  }
  if (rule.meal_minutes_unpaid > 0) {
    planned.push({ userId, ruleId: rule.id, kind: "meal", minutes: rule.meal_minutes_unpaid });
  }
  return planned;
}

export interface ShiftAssignment {
  userId: string;
  arrivalTime: Date | null;
  birthdate: string | null;
  shiftMinutes: number;
}

/**
 * Builds the full break plan for a setup: for each assignment, picks the
 * matching rule and expands it, tagging each planned break with its
 * sequence position (arrival order, earliest first; assignments with no
 * arrival_time sort last since they can't be sequenced yet).
 */
export function buildBreakPlan(
  assignments: ShiftAssignment[],
  rules: BreakRule[],
  now: Date,
): (PlannedBreak & { sequence: number })[] {
  const ordered = [...assignments].sort((a, b) => {
    if (a.arrivalTime && b.arrivalTime) return a.arrivalTime.getTime() - b.arrivalTime.getTime();
    if (a.arrivalTime) return -1;
    if (b.arrivalTime) return 1;
    return 0;
  });

  const planned: (PlannedBreak & { sequence: number })[] = [];
  let sequence = 1;
  for (const assignment of ordered) {
    const ageBand = ageBandFromBirthdate(assignment.birthdate, now);
    const rule = selectBreakRule(rules, ageBand, assignment.shiftMinutes);
    if (!rule) continue;
    for (const planned_break of expandRuleToBreaks(assignment.userId, rule)) {
      planned.push({ ...planned_break, sequence });
      sequence += 1;
    }
  }
  return planned;
}

/** SEED-DEFAULT: grace window before an authorized-but-not-started break counts as overdue. */
export const OVERDUE_GRACE_MINUTES = 10;

export interface BreakRow {
  status: string;
  authorized_at: string | null;
}

/** A break becomes overdue once it's been authorized for longer than the grace window without starting. */
export function isOverdue(
  breakRow: BreakRow,
  now: Date,
  graceMinutes = OVERDUE_GRACE_MINUTES,
): boolean {
  if (breakRow.status !== "authorized" || !breakRow.authorized_at) return false;
  const authorizedAt = new Date(breakRow.authorized_at);
  if (Number.isNaN(authorizedAt.getTime())) return false;
  const elapsedMinutes = (now.getTime() - authorizedAt.getTime()) / 60_000;
  return elapsedMinutes > graceMinutes;
}

/** A break is missed if the shift ended and it never even started. */
export function isMissed(breakRow: BreakRow, shiftEnd: Date, now: Date): boolean {
  if (!["pending", "authorized", "overdue"].includes(breakRow.status)) return false;
  return now.getTime() >= shiftEnd.getTime();
}

/**
 * Real "Needs Break" due time (P2 wiring fix — the board previously hardcoded
 * `breakDueAt: null` or passed `authorized_at`, so the pending-but-due branch
 * of `needsBreakBadge` never fired). A break becomes due once the person has
 * worked the rule's `min_shift_minutes` since arrival — that's the same
 * threshold `selectBreakRule` used to grant the entitlement in the first
 * place, so "due" and "entitled" agree by construction. Returns null when
 * either input is missing (can't compute without an arrival time and a rule).
 */
export function computeBreakDueAt(
  arrivalTime: Date | null,
  rule: Pick<BreakRule, "min_shift_minutes"> | null,
): Date | null {
  if (!arrivalTime || !rule) return null;
  return new Date(arrivalTime.getTime() + rule.min_shift_minutes * 60_000);
}

/** Entitled minutes for one break row, by kind (LOW: "entitlement minutes computed then discarded"). */
export function entitledMinutesForKind(
  rule: Pick<BreakRule, "rest_minutes_paid" | "meal_minutes_unpaid"> | null,
  kind: BreakKind | string,
): number | null {
  if (!rule) return null;
  return kind === "rest" ? rule.rest_minutes_paid : rule.meal_minutes_unpaid;
}

/**
 * Lag (in minutes) between a break being authorized and actually started
 * (ARCHITECTURE.md: "tracks each break through authorized -> started ->
 * completed, recording the lag between authorization and actually going").
 * Returns null until both timestamps exist.
 */
export function authorizationToStartLagMinutes(
  authorizedAt: string | null,
  startedAt: string | null,
): number | null {
  if (!authorizedAt || !startedAt) return null;
  const authorized = new Date(authorizedAt);
  const started = new Date(startedAt);
  if (Number.isNaN(authorized.getTime()) || Number.isNaN(started.getTime())) return null;
  return Math.max(0, Math.round((started.getTime() - authorized.getTime()) / 60_000));
}

/** Legal status transitions, used to keep authorize/start/complete idempotent (double-submit safe). */
export const VALID_TRANSITIONS: Record<BreakStatus, BreakStatus[]> = {
  pending: ["authorized", "missed"],
  authorized: ["active", "overdue", "missed"],
  active: ["completed"],
  overdue: ["active", "missed"],
  completed: [],
  missed: [],
};

export function canTransition(from: string, to: BreakStatus): boolean {
  const validFrom = VALID_TRANSITIONS[from as BreakStatus];
  return Boolean(validFrom && validFrom.includes(to));
}
