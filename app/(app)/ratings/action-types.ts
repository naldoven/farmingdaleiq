/**
 * Shared result type for the Ratings server actions. Kept out of the
 * "use server" action file itself, matching the People/Teams reference
 * pattern (app/(app)/people/action-types.ts).
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
