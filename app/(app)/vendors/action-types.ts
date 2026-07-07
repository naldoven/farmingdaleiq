/** Shared result type for Vendors server actions (see app/(app)/people/action-types.ts). */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
