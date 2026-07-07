/**
 * Shared result type for the Setups/Templates server actions. Kept out of
 * the "use server" action files themselves: Next.js only allows async
 * function exports from a file marked "use server", so shared types/helpers
 * used by more than one action file live here instead (mirrors
 * app/(app)/people/action-types.ts's pattern; duplicated locally rather than
 * imported cross-module so this stream doesn't depend on People's files).
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
