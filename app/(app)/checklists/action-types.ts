/**
 * Shared result type for Checklists server actions. Kept out of "use server"
 * files (Next.js only allows async function exports from those) so it can be
 * imported by action files, tests, and client components alike. Mirrors
 * app/(app)/people/action-types.ts (the reference pattern) but kept local to
 * this stream since People's file is out of scope to import from.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
