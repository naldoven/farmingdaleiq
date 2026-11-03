import type { RecoveryStatus, SendChannel } from "@/app/(app)/guest-recovery/constants";
import type { SendOutcome } from "@/lib/guest-recovery/send-core";
import type { RecoverySendView, RecoveryView } from "@/app/(app)/guest-recovery/types";

/**
 * Pure helpers that turn a recovery's sends into the words on the card. No
 * database, so they are unit-tested on their own.
 */

export type ChannelState = "sent" | "failed" | "skipped" | "unknown" | "none";

export interface ChannelSummary {
  channel: SendChannel;
  state: ChannelState;
  /** Short line for the card, e.g. "Emailed Oct 22 at 4:30 PM" is built by the screen from sentAt. */
  label: string;
  sentAt: string | null;
}

const UNKNOWN_AFTER_MS = 2 * 60_000;

/**
 * The newest send for a channel decides what the card shows. A row still on
 * "sending" after two minutes means the server died mid-send, so the outcome
 * is unknown and a leader should confirm before resending.
 */
export function summarizeChannel(
  channel: SendChannel,
  sends: RecoverySendView[],
  hasContact: boolean,
  now: Date = new Date(),
): ChannelSummary {
  const noun = channel === "email" ? "Email" : "Text";
  if (!hasContact) {
    return { channel, state: "none", label: channel === "email" ? "No email given" : "No phone given", sentAt: null };
  }
  const mine = sends
    .filter((s) => s.channel === channel)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // A success anywhere in the history wins over a later failed retry only if
  // it is the newest; otherwise the newest attempt is what the leader needs to see.
  const latest = mine[0];
  if (!latest) return { channel, state: "none", label: `${noun} not sent yet`, sentAt: null };

  const sentOnce = mine.find((s) => s.status === "sent");
  if (latest.status === "sent") return { channel, state: "sent", label: `${noun} sent`, sentAt: latest.sentAt };
  if (latest.status === "skipped") {
    return { channel, state: "skipped", label: latest.error ?? `${noun} was not sent`, sentAt: sentOnce?.sentAt ?? null };
  }
  if (latest.status === "sending") {
    const age = now.getTime() - new Date(latest.createdAt).getTime();
    if (age < UNKNOWN_AFTER_MS) return { channel, state: "none", label: `${noun} sending`, sentAt: null };
    return { channel, state: "unknown", label: `${noun}: unknown if it went out`, sentAt: null };
  }
  const unknown = latest.error?.startsWith("Unknown") ?? false;
  return {
    channel,
    state: unknown ? "unknown" : "failed",
    label: unknown ? `${noun}: unknown if it went out` : `${noun} failed${latest.error ? `: ${latest.error}` : ""}`,
    sentAt: sentOnce?.sentAt ?? null,
  };
}

/** True when the guest has not been reached by any channel yet (nothing sent). */
export function nothingReachedGuest(recovery: Pick<RecoveryView, "sends">): boolean {
  return !recovery.sends.some((s) => s.status === "sent");
}

/** Plain-English line for a Given or Void answer, so a second scan explains itself. */
export function outcomeMessage(
  action: "give" | "void",
  result: string,
): { ok: boolean; message: string } {
  if (action === "give") {
    if (result === "given") return { ok: true, message: "Marked as handed over." };
    if (result === "already_given") return { ok: true, message: "Already handed over. Nothing changed." };
    if (result === "void") return { ok: false, message: "This recovery was voided, so there is nothing to hand over." };
    return { ok: false, message: "That recovery was not found." };
  }
  if (result === "void") return { ok: true, message: "Voided." };
  if (result === "already_void") return { ok: true, message: "Already voided. Nothing changed." };
  if (result === "given") return { ok: false, message: "This was already handed over, so it cannot be voided." };
  return { ok: false, message: "That recovery was not found." };
}

/** One line for the toast after logging or resending, built from the send outcomes. */
export function sendOutcomeSummary(outcomes: SendOutcome[]): string {
  const sent = outcomes.filter((o) => o.result === "sent").map((o) => (o.channel === "email" ? "emailed" : "texted"));
  const problems = outcomes.filter((o) => o.result === "failed");
  const already = outcomes.some((o) => o.result === "already_sent");
  const parts: string[] = [];
  if (sent.length > 0) parts.push(`Guest ${sent.join(" and ")}.`);
  if (already && sent.length === 0) parts.push("Already saved and sent.");
  if (problems.length > 0) {
    parts.push(
      `${problems.map((o) => (o.channel === "email" ? "Email" : "Text")).join(" and ")} did not send. Use Resend on the card.`,
    );
  }
  if (parts.length === 0) parts.push("Saved. Nothing was sent yet. Use Resend, or copy the link.");
  return parts.join(" ");
}

export function statusLabel(status: RecoveryStatus): string {
  return status === "owed" ? "Still owed" : status === "given" ? "Handed over" : "Voided";
}

/** Search by guest name or order number, for the list screen's filter box. */
export function matchesSearch(recovery: Pick<RecoveryView, "guestName" | "orderNumber">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return recovery.guestName.toLowerCase().includes(q) || (recovery.orderNumber ?? "").toLowerCase().includes(q);
}

/** "just now", "5 min ago", "3 hr ago", "2 days ago". For list cards, where the exact time is noise. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** Whole days a recovery has been waiting, for the "over a week" flag. */
export function daysOwed(iso: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}
