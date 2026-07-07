/** Shared result type for the Breaks server actions. See app/(app)/setups/action-types.ts for why this is duplicated per module rather than shared cross-module. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
