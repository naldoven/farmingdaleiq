/** Duplicated on purpose — see app/(app)/notifications/action-types.ts for why. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
