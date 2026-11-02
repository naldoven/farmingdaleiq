import { formatStoreDate } from "@/lib/time";

/**
 * Expiry rules for a guest's code. A code past its date is still shown (the
 * guest and what they are owed stay on screen with a red EXPIRED banner), never
 * an error; the leader decides whether to honor it. The date itself is set in
 * the database when the recovery is logged (now plus the expiry setting).
 */

const DAY_MS = 86_400_000;

/** True once the expiry instant has passed. A missing date never expires. */
export function isExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= now.getTime();
}

/** Whole days left, rounded up, so the last day reads "1 day left". Zero or less once expired. */
export function daysLeft(expiresAt: string, now: Date = new Date()): number {
  return Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS);
}

/** "Good until Jan 30, 2027", in the store's time zone. */
export function goodUntilLabel(expiresAt: string): string {
  return `Good until ${formatStoreDate(expiresAt)}`;
}

/** A short line for a card or the redeem screen. */
export function expiryLine(expiresAt: string, now: Date = new Date()): string {
  if (isExpired(expiresAt, now)) return `Expired ${formatStoreDate(expiresAt)}`;
  const left = daysLeft(expiresAt, now);
  return `${goodUntilLabel(expiresAt)} (${left} ${left === 1 ? "day" : "days"} left)`;
}
