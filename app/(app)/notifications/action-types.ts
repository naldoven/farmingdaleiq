/**
 * Shared result type for this module's server actions. Duplicated (rather
 * than imported) from app/(app)/people/action-types.ts on purpose: PLAN.md's
 * hard boundary is "do not reach into other modules," and this three-line
 * type isn't worth a cross-module dependency.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
