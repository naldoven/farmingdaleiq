/**
 * Shared result type for the Ratings server actions. Kept out of the
 * "use server" action file itself, matching the People/Teams reference
 * pattern (app/(app)/people/action-types.ts).
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * The current rating a rate action settled on. On the normal path this is the
 * value just written; when a concurrent rate wins the race (RAT2), it is the
 * value read back from the now-current row, so the caller learns the real
 * current value instead of a bare success that hides the discarded write.
 */
export type RatingSnapshot = { stars: number; comment: string | null };
