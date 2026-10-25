/**
 * Shared result type for Cleaning server actions. Kept out of actions.ts
 * because a "use server" file may only export async functions (same reason
 * as app/(app)/people/action-types.ts).
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
