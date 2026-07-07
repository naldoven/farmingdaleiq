/**
 * Shared result type for People/Teams server actions. Kept out of the
 * "use server" action files themselves: Next.js only allows async function
 * exports from a file marked "use server", so shared types/helpers used by
 * more than one action file live here instead.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
