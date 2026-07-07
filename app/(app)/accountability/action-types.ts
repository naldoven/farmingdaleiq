/**
 * Shared result type for Accountability server actions. Kept out of the
 * "use server" action file itself: Next.js only allows async function
 * exports from a file marked "use server", so shared types used by more than
 * one action file (and by client components) live here instead. Mirrors
 * app/(app)/people/action-types.ts's ActionResult shape, duplicated locally
 * rather than imported cross-module (this stream owns only
 * app/(app)/accountability and components/accountability).
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
