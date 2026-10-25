/**
 * Break compliance engine (ARCHITECTURE.md "Breaks — compliance engine
 * (adopted from OneClick)"). Pure functions only — no Supabase client — so
 * the entitlement math, sequencing, and overdue/missed detection are all
 * unit-testable without a database. Callers (app/(app)/breaks/actions.ts)
 * fetch rows and pass plain data in.
 */

import { storeLocalDate } from "@/lib/time";

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

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

function dateParts(value: string): [number, number, number] | null {
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Minors are anyone under 18; a missing birthdate defaults to adult (can't
 * assume minor without data). Age is computed on the store's calendar day
 * (lib/time storeLocalDate), not the server's: Vercel runs in UTC, so between
 * 8pm and midnight New York time the server's "today" is already tomorrow,
 * and someone's 18th birthday would be recognized a day early.
 */
export function ageBandFromBirthdate(birthdate: string | null, now: Date): AgeBand {
  if (!birthdate) return "adult";
  const dob = dateParts(birthdate);
  const today = dateParts(storeLocalDate(now));
  if (!dob || !today) return "adult";

  const [dobYear, dobMonth, dobDay] = dob;
  const [year, month, day] = today;
  let age = year - dobYear;
  if (month < dobMonth || (month === dobMonth && day < dobDay)) {
    age -= 1;
  }
  return age < 18 ? "minor" : "adult";
}

export interface ShiftWindow {
  /** When the person actually arrives (setup_assignments.arrival_time). */
  arrival: Date | null;
  /** When the person is scheduled to leave (setup_assignments.scheduled_end). */
  scheduledEnd: Date | null;
  /** The setup's day-part window, used only as the fallback. */
  dayPartStart: Date | null;
  dayPartEnd: Date | null;
}

/**
 * Length of the shift the break rule is measured against, in minutes.
 *
 * The confirmed Farmingdale rule is about the SCHEDULED shift ("scheduled 6
 * hours earns one 30-minute break"), so the preferred measure is arrival ->
 * scheduled_end. Before scheduled_end existed the engine measured arrival ->
 * day-part end, and every seeded day-part is under five hours, so no adult
 * ever qualified. The day-part end stays as the fallback for an assignment
 * with no scheduled end recorded, which keeps old rows and the e2e fixture
 * behaving exactly as before. A scheduled end at or before the start is
 * treated as missing rather than producing a negative shift.
 */
export function computeShiftMinutes(window: ShiftWindow): number {
  const start = window.arrival ?? window.dayPartStart;
  if (!start) return 0;
  const scheduledEnd =
    window.scheduledEnd && window.scheduledEnd.getTime() > start.getTime() ? window.scheduledEnd : null;
  const end = scheduledEnd ?? window.dayPartEnd;
  if (!end) return 0;
  return Math.max(0, (end.getTime() - start.getTime()) / 60_000);
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
 * The instant after which an open break is swept to 'missed' (final).
 *
 * Not the day-part end on its own: a break becomes due at arrival plus the
 * rule's min_shift_minutes (360 for the live Farmingdale rule) and every
 * seeded day-part is five hours or less. An adult working 06:00 to 14:00 on
 * the Morning setup (06:00 to 11:00) is due at 12:00, so sweeping at 11:00
 * would mark the break missed an hour before the person can even take it.
 * The cutoff is therefore the LATEST of the day-part end, the person's
 * scheduled end, and the break's own due time. Returns null when there is no
 * day-part end to anchor on (an "any day-part" setup is left alone).
 */
export function computeMissedCutoff(input: {
  dayPartEnd: Date | null;
  scheduledEnd: Date | null;
  dueAt: Date | null;
}): Date | null {
  if (!input.dayPartEnd || Number.isNaN(input.dayPartEnd.getTime())) return null;
  let cutoff = input.dayPartEnd.getTime();
  for (const candidate of [input.scheduledEnd, input.dueAt]) {
    if (candidate && !Number.isNaN(candidate.getTime()) && candidate.getTime() > cutoff) {
      cutoff = candidate.getTime();
    }
  }
  return new Date(cutoff);
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
