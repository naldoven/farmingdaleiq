// What to do when a queued walkthrough photo fails to send. Ported from the
// Quote Tool's crew-camera decideSend, which came out of a live incident: a
// worker mid-run was losing roughly one shot in five, and the app threw each
// failed photo away. The rule that came out of it: a photo that has been TAKEN
// is never discarded by the app. The worst outcome of a failure is "held until
// a person taps retry", never "gone".
//
// Safe to resend as often as needed: the server dedupes on the client-made
// photo id, so a retry after a response that was lost in transit cannot
// create a duplicate.

/** Total tries before a retryable failure is held for a person. */
export const MAX_SEND_ATTEMPTS = 6;

export type SendOutcome =
  | { kind: "ok" }
  /** The server answered with this status. */
  | { kind: "http"; status: number }
  /** No answer at all: offline, dropped connection, timeout. */
  | { kind: "network" };

/** done: remove it from the queue. retry: wait retryDelayMs and send again.
 * hold: stop automatic sending, keep the photo, let a person tap to retry. */
export type SendDecision = "done" | "retry" | "hold";

/** Backoff before the next try, in ms. `attempt` is 1-based (the number of
 * tries made so far). Grows 2s, 4s, 6s... and stops at 15s, so a dead zone in
 * the walk-in cooler cannot keep the phone's radio busy flattening the
 * battery. */
export function retryDelayMs(attempt: number): number {
  // NaN and anything below 1 get the shortest delay instead of a nonsense one.
  if (!(attempt >= 1)) return 2000;
  return Math.min(2000 * attempt, 15000);
}

// Statuses where waiting and trying again can plausibly work: the server was
// busy, restarting or shedding load. Every other 4xx says the request itself
// is wrong (bad data, no permission, expired sign-in) and will stay wrong
// however many times it is resent.
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

/** PURE. `attemptsSoFar` counts the try that just failed (1 after the first
 * failure). A retryable failure retries until MAX_SEND_ATTEMPTS, then holds.
 * Anything that will not fix itself holds at once. The unexpected (a 3xx, or a
 * status below 400 reported as a failure) holds too: marking it "done" could
 * drop a photo the server never confirmed, and retrying cannot help. */
export function decideSend(outcome: SendOutcome, attemptsSoFar: number): SendDecision {
  if (outcome.kind === "ok") return "done";
  const retryable = outcome.kind === "network" || isRetryableStatus(outcome.status);
  if (!retryable) return "hold";
  return attemptsSoFar >= MAX_SEND_ATTEMPTS ? "hold" : "retry";
}
