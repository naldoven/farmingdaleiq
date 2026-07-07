/**
 * Shared result type for the Tokens server actions. Kept out of the "use
 * server" action file itself: Next.js only allows async function exports
 * from a file marked "use server", so shared types used by more than one
 * action (and by tests importing them) live here instead. Same pattern as
 * app/(app)/people/action-types.ts.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
