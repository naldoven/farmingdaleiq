/**
 * Highlight badge computation (ARCHITECTURE.md "Highlight badges & store
 * layout"). PLAN.md S3 brief: "badges (New, Minor, Trainee, Leader,
 * Birthday, Needs Break) as computed helpers in own module." Badges are
 * never stored — always derived from profile/role/break data at render
 * time, so this module is pure functions over plain inputs (no Supabase
 * client), which keeps it unit-testable and reusable from both the setup
 * board and the break manager.
 *
 * Trainee status lives in S4's `trainee_enrollments` table (not owned by
 * this stream). Per PLAN.md's auto-place stub pattern, trainee status is
 * looked up through a small local interface that returns a safe default
 * until P2 wiring connects it to the real table.
 */

export type BadgeKind =
  | "new"
  | "minor"
  | "trainee"
  | "leader"
  | "birthday"
  | "needs_break";

export interface Badge {
  kind: BadgeKind;
  label: string;
}

/** SEED-DEFAULT: ARCHITECTURE.md doesn't specify a "recent hire" window. */
export const NEW_HIRE_WINDOW_DAYS = 30;

/** SEED-DEFAULT: Birthday badge shows if the birthday falls within this many days (today inclusive). */
export const BIRTHDAY_WINDOW_DAYS = 7;

/**
 * SEED-DEFAULT: matches the seeded rank order (supabase/migrations/
 * 20260707001900_seed_store_config.sql) where Team Leader and above (rank
 * 1-6) are shift-leader-capable roles.
 */
export const LEADER_RANK_THRESHOLD = 6;

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((b.getTime() - a.getTime()) / msPerDay);
}

/**
 * Parses a `date` column value ("YYYY-MM-DD") into plain Y/M/D integers by
 * splitting the string, never through `new Date(str)`. Postgres `date`
 * columns carry no timezone, but `new Date("YYYY-MM-DD")` parses as UTC
 * midnight — reading it back with local getters (getMonth/getDate) can land
 * on the wrong calendar day in any timezone west of UTC. Splitting the
 * string sidesteps that entirely.
 */
function parseDateOnly(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.test(value) ? value.split("-") : null;
  if (!match) return null;
  const [year, month, day] = match.map(Number);
  return { year, month: month - 1, day };
}

export function isNewHire(
  hiredOn: string | null,
  now: Date,
  windowDays = NEW_HIRE_WINDOW_DAYS,
): boolean {
  if (!hiredOn) return false;
  const parsed = parseDateOnly(hiredOn);
  if (!parsed) return false;
  const hired = new Date(parsed.year, parsed.month, parsed.day);
  const diff = daysBetween(hired, now);
  return diff >= 0 && diff <= windowDays;
}

export function calculateAge(birthdate: string, now: Date): number {
  const parsed = parseDateOnly(birthdate);
  if (!parsed) return NaN;
  let age = now.getFullYear() - parsed.year;
  const monthDiff = now.getMonth() - parsed.month;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < parsed.day)) {
    age -= 1;
  }
  return age;
}

export function isMinor(birthdate: string | null, now: Date): boolean {
  if (!birthdate) return false;
  const age = calculateAge(birthdate, now);
  return !Number.isNaN(age) && age < 18;
}

export function isBirthdayWindow(
  birthdate: string | null,
  now: Date,
  windowDays = BIRTHDAY_WINDOW_DAYS,
): boolean {
  if (!birthdate) return false;
  const parsed = parseDateOnly(birthdate);
  if (!parsed) return false;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < windowDays; i += 1) {
    const candidate = new Date(today);
    candidate.setDate(candidate.getDate() + i);
    if (candidate.getMonth() === parsed.month && candidate.getDate() === parsed.day) {
      return true;
    }
  }
  return false;
}

export function isLeaderRank(
  rank: number | null,
  threshold = LEADER_RANK_THRESHOLD,
): boolean {
  return rank !== null && rank !== undefined && rank <= threshold;
}

/**
 * Break statuses that mean "this person still needs to go on their break."
 * `pending` only counts once it is actually due (dueAt <= now) so the badge
 * doesn't light up the moment a shift starts.
 */
export function needsBreakBadge(
  breakStatus: string | null | undefined,
  dueAt: Date | null,
  now: Date,
): boolean {
  if (!breakStatus) return false;
  if (breakStatus === "overdue") return true;
  if (breakStatus === "authorized") return true;
  if (breakStatus === "pending") {
    if (!dueAt) return false;
    return dueAt.getTime() <= now.getTime();
  }
  return false;
}

/** Stub trainee-status lookup (S4 owns `trainee_enrollments`). */
export interface TraineeStatusLookup {
  isTrainee(userId: string): Promise<boolean>;
}

export const stubTraineeStatusLookup: TraineeStatusLookup = {
  // STUB for P2 wiring: always "not a trainee" until S4's
  // trainee_enrollments table is available to read from here.
  async isTrainee() {
    return false;
  },
};

export interface BadgeInputs {
  hiredOn: string | null;
  birthdate: string | null;
  roleRank: number | null;
  isTrainee: boolean;
  breakStatus?: string | null;
  breakDueAt?: Date | null;
}

const BADGE_LABELS: Record<BadgeKind, string> = {
  new: "New",
  minor: "Minor",
  trainee: "Trainee",
  leader: "Leader",
  birthday: "Birthday",
  needs_break: "Needs Break",
};

export function computeBadges(inputs: BadgeInputs, now: Date = new Date()): Badge[] {
  const badges: Badge[] = [];

  if (isNewHire(inputs.hiredOn, now)) badges.push({ kind: "new", label: BADGE_LABELS.new });
  if (isMinor(inputs.birthdate, now)) badges.push({ kind: "minor", label: BADGE_LABELS.minor });
  if (inputs.isTrainee) badges.push({ kind: "trainee", label: BADGE_LABELS.trainee });
  if (isLeaderRank(inputs.roleRank)) badges.push({ kind: "leader", label: BADGE_LABELS.leader });
  if (isBirthdayWindow(inputs.birthdate, now))
    badges.push({ kind: "birthday", label: BADGE_LABELS.birthday });
  if (needsBreakBadge(inputs.breakStatus, inputs.breakDueAt ?? null, now))
    badges.push({ kind: "needs_break", label: BADGE_LABELS.needs_break });

  return badges;
}
