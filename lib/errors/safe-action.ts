/**
 * Client-side wrapper for calling a server action.
 *
 * Server actions return a discriminated ActionResult for *expected* failures
 * (validation, permissions, DB errors), but a transport-layer failure -- the
 * POST never reaching the server -- makes the call REJECT instead. Every waste
 * call site did `startTransition(async () => { const r = await action(...) })`
 * with no try/catch, so that rejection escaped into React and either surfaced
 * as the generic route error boundary ("We couldn't open this page") or as an
 * unhandled rejection that did nothing visible at all.
 *
 * That matters most exactly where this app is used: the service worker
 * deliberately passes POSTs straight through with no offline queue
 * (public/sw.js), so a leader tapping "+1" on a phone in the walk-in with one
 * bar got no entry and no error. Wrapping the call converts the rejection into
 * the same ActionResult shape the caller already handles, so the existing
 * inline error rendering just works.
 */

export const NETWORK_ERROR_MESSAGE =
  "Couldn't reach the server. Check your connection and try again.";

export async function safeAction<T>(
  call: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return await call();
  } catch (error) {
    console.error("server action failed", error);
    return { ok: false, error: NETWORK_ERROR_MESSAGE };
  }
}
