/**
 * Shared result type for Maintenance server actions. Kept out of the
 * "use server" action files themselves: Next.js only allows async function
 * exports from a file marked "use server", so shared types used by more than
 * one action file live here instead (mirrors app/(app)/people/action-types.ts).
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
