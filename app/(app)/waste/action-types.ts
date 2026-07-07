/**
 * Shared result type for Waste server actions (app/(app)/waste/actions.ts).
 * Kept out of the "use server" action file itself: Next.js only allows async
 * function exports from a file marked "use server", so shared types used by
 * more than one action (and by the client components that call them) live
 * here instead. Same shape as app/(app)/people/action-types.ts and
 * app/(app)/checklists/action-types.ts (the reference patterns for this
 * stream).
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
