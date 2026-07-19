/**
 * Pure helpers for Position Ratings (ARCHITECTURE.md "Position Ratings").
 * Kept side-effect-free so they're directly unit-testable without a DB.
 */

/** 3.0+ stars = qualified for the position. */
export const QUALIFIED_THRESHOLD = 3;

/** 30-day re-rate cadence (ARCHITECTURE.md "Re-rate prompts"). */
export const RERATE_INTERVAL_DAYS = 30;

export function isQualified(stars: number): boolean {
  return stars >= QUALIFIED_THRESHOLD;
}

export function computeAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

/** Averages the (up to) 4 rubric category scores into a single stars value. */
export function averageCategoryScores(scores: {
  category_1?: number | null;
  category_2?: number | null;
  category_3?: number | null;
  category_4?: number | null;
}): number {
  const values = [scores.category_1, scores.category_2, scores.category_3, scores.category_4].filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v),
  );
  return computeAverage(values) ?? 0;
}

export type RatingColor = "above" | "below" | "even" | "none";

/** Skills-matrix color coding: above store average = blue, below = red. */
export function colorForRating(stars: number | null, storeAverage: number | null): RatingColor {
  if (stars === null) return "none";
  if (storeAverage === null) return "even";
  if (stars > storeAverage) return "above";
  if (stars < storeAverage) return "below";
  return "even";
}

/** True when `ratedAt` is at least RERATE_INTERVAL_DAYS in the past. */
export function isRerateDue(ratedAt: string | Date, now: Date = new Date()): boolean {
  const rated = typeof ratedAt === "string" ? new Date(ratedAt) : ratedAt;
  const diffMs = now.getTime() - rated.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= RERATE_INTERVAL_DAYS;
}

/** due_on for a rerate prompt generated from a current rating's rated_at. */
export function rerateDueDate(ratedAt: string | Date): Date {
  const rated = typeof ratedAt === "string" ? new Date(ratedAt) : ratedAt;
  const due = new Date(rated);
  due.setDate(due.getDate() + RERATE_INTERVAL_DAYS);
  return due;
}

export interface MatrixPositionInput {
  id: string;
  name: string;
  /** false = onboarding-roadmap item, not a rateable skill station (RAT1). */
  is_rateable?: boolean | null;
  /** position_group name, for disambiguating duplicated station names. */
  groupName?: string | null;
}

export interface MatrixColumn {
  id: string;
  name: string;
  groupName: string | null;
  /** true when another rateable column shares this name — show the group. */
  showGroup: boolean;
}

/**
 * RAT1: the skills-matrix columns. Keeps only real skill stations (drops
 * onboarding-roadmap items flagged is_rateable=false) and marks any station
 * whose name still appears more than once so the UI can disambiguate it with
 * its position_group label. A missing is_rateable (older row / undefined)
 * counts as rateable so nothing real is hidden by accident.
 */
export function rateableColumns(positions: MatrixPositionInput[]): MatrixColumn[] {
  const rateable = positions.filter((p) => p.is_rateable !== false);
  const nameCounts = new Map<string, number>();
  for (const p of rateable) {
    nameCounts.set(p.name, (nameCounts.get(p.name) ?? 0) + 1);
  }
  return rateable.map((p) => ({
    id: p.id,
    name: p.name,
    groupName: p.groupName ?? null,
    showGroup: (nameCounts.get(p.name) ?? 0) > 1,
  }));
}

/**
 * RAT4: tooltip text for a rating cell. Includes the prior comment (when there
 * is one) so a leader can read the note left with the last rating without
 * opening the dialog.
 */
export function ratingCellTitle(
  personName: string,
  positionName: string,
  comment?: string | null,
): string {
  const base = `${personName} — ${positionName}`;
  const trimmed = comment?.trim();
  return trimmed ? `${base}\n“${trimmed}”` : base;
}
