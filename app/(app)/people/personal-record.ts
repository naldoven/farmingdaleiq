/**
 * Pure shaping helpers for the profile page's "Personal record" summary
 * (KITCHENIQ-PARITY-AUDIT.md "People & Teams" [MED]: "Profile page does not
 * aggregate the personal record — no to-dos, accountability, training, or
 * token balance on the page"). Kept out of the page component (and out of
 * "use server" actions) so the aggregation math is unit-testable without a
 * database.
 */

export interface TaskStatusRow {
  status: string;
}

/** Counts open to-dos: tasks assigned to the profile that are not yet done. */
export function countOpenTasks(tasks: TaskStatusRow[]): number {
  return tasks.filter((t) => t.status === "pending" || t.status === "overdue").length;
}

/** Counts completed to-dos: tasks the profile finished. */
export function countCompletedTasks(tasks: TaskStatusRow[]): number {
  return tasks.filter((t) => t.status === "completed").length;
}

export interface InfractionPointsRow {
  points: number | null;
  expires_at: string | null;
}

/**
 * Sums the still-active (not yet expired) infraction points for a profile,
 * mirroring the rolling-period math in app/(app)/accountability/logic.ts
 * without importing it (that module belongs to a different fix lane).
 * `points` is typed nullable because it comes through `my_infractions`
 * (a view, whose generated columns are all nullable) as well as the base
 * `infractions` table.
 */
export function summarizeActiveAccountabilityPoints(
  infractions: InfractionPointsRow[],
  now: Date,
): number {
  return infractions
    .filter((i) => i.expires_at === null || new Date(i.expires_at) > now)
    .reduce((sum, i) => sum + (i.points ?? 0), 0);
}

export interface TraineeEnrollmentStatusRow {
  status: string;
}

export interface TrainingProgressSummary {
  active: number;
  graduated: number;
  pip: number;
}

/** Buckets a profile's trainee_enrollments rows by lifecycle status. */
export function summarizeTrainingProgress(
  enrollments: TraineeEnrollmentStatusRow[],
): TrainingProgressSummary {
  return enrollments.reduce(
    (acc, e) => {
      if (e.status === "active") acc.active += 1;
      else if (e.status === "graduated") acc.graduated += 1;
      else if (e.status === "pip") acc.pip += 1;
      return acc;
    },
    { active: 0, graduated: 0, pip: 0 },
  );
}

export interface PassportEnrollmentRow {
  stamped_at: string | null;
}

/** Counts completed vs in-progress development passports for a profile. */
export function summarizePassportProgress(enrollments: PassportEnrollmentRow[]): {
  completed: number;
  inProgress: number;
} {
  const completed = enrollments.filter((e) => e.stamped_at !== null).length;
  return { completed, inProgress: enrollments.length - completed };
}
