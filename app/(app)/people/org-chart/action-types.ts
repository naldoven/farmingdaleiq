/** Shared result type for /people/org-chart server actions (S4-owned route
 * within the P0-owned /people tree). Matches the People/Teams pattern. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
