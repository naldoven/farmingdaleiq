/**
 * Shared result type for Tasks server actions. Kept out of the "use server"
 * action files themselves: Next.js only allows async function exports from a
 * file marked "use server", so shared types/helpers used by more than one
 * action file live here instead. Mirrors app/(app)/people/action-types.ts
 * (the reference pattern from PLAN.md's People/Teams module) but kept local
 * to this stream so S2 never imports from another stream's directory.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
