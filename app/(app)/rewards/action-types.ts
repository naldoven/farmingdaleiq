/**
 * Shared result type for the Rewards server actions. Same pattern as
 * app/(app)/people/action-types.ts.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
