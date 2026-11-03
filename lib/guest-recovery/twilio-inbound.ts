import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Helpers for the inbound text webhook (app/api/inbound/twilio-sms). Twilio
 * blocks texts to a number that replied STOP on its own side; this lets the app
 * see the same replies, so the opt-out list the send code checks is real.
 */

export type ReplyKind = "stop" | "start" | "help" | "other";

// The keywords Twilio treats as opt-out and opt-in on a US long code. A word
// inside a sentence ("stop by the store") does not count: Twilio matches the
// whole message, and so do we.
const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_WORDS = new Set(["START", "YES", "UNSTOP"]);
const HELP_WORDS = new Set(["HELP", "INFO"]);

export function classifyReply(body: string | undefined | null): ReplyKind {
  const word = (body ?? "").trim().toUpperCase();
  if (STOP_WORDS.has(word)) return "stop";
  if (START_WORDS.has(word)) return "start";
  if (HELP_WORDS.has(word)) return "help";
  return "other";
}

/**
 * Twilio signs each webhook: base64 HMAC-SHA1 of the full URL followed by every
 * form field, sorted by name, as name+value, keyed with the account's auth
 * token. Without a token or a signature this is false, so a misconfigured
 * deployment refuses every request instead of accepting forged ones.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null | undefined,
  authToken: string | undefined,
): boolean {
  if (!authToken || !signature) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
