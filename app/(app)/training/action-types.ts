/**
 * Shared result type for every S4 training-tree server action
 * (/training, /training/grid, /training/schedule, /training/graduates,
 * /training/pipelines, /people/org-chart). Matches the People/Teams
 * reference pattern (app/(app)/people/action-types.ts).
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
