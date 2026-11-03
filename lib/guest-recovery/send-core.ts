import type { SendChannel } from "@/app/(app)/guest-recovery/constants";
import { buildEmail, buildSms, recoveryLink, type MessageItem } from "@/lib/guest-recovery/messages";

/**
 * The send rules for a guest's email and text, with every outside call passed
 * in (SendDeps) so the rules are testable without a database or a provider.
 * lib/guest-recovery/send.ts wires the real ones.
 *
 * The guarantees, in order of importance:
 *   1. A message goes out at most once per claim. claim() inserts the send row
 *      first (the database refuses a second initial claim and a resend within
 *      30 seconds), and the provider call only happens for the caller that got
 *      the row back. The row id doubles as the provider's idempotency key.
 *   2. A text never goes to a guest who did not agree to it, to a number that
 *      opted out, or while texting is switched off.
 *   3. A provider failing, or not answering, never throws out of here: it is
 *      recorded on the send row and the other channel still runs. A call that
 *      threw may have reached the provider, so it is marked unknown and left
 *      for a leader to retry by hand, never retried automatically.
 */

export interface SendRecovery {
  id: string;
  token: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  orderNumber: string | null;
  smsConsent: boolean;
  items: MessageItem[];
}

export type EmailResult = { ok: true } | { ok: false; error: string };
export type SmsResult = { ok: true } | { ok: false; error: string; optedOut?: boolean };

export interface SendDeps {
  /** Public address of the app, e.g. https://app.example.com. Null means the guest link cannot be built. */
  baseUrl: string | null;
  smsEnabled: boolean;
  emailConfigured: boolean;
  smsConfigured: boolean;
  /** Returns the new send row's id, or null when this send must not go out. */
  claim(recoveryId: string, channel: SendChannel, kind: "initial" | "resend"): Promise<string | null>;
  finish(
    sendId: string,
    patch: { status: "sent" | "failed" | "skipped"; error?: string | null; sentAt?: string },
  ): Promise<void>;
  isOptedOut(phone: string): Promise<boolean>;
  recordOptOut(phone: string): Promise<void>;
  qrPng(link: string): Promise<Buffer>;
  sendEmail(args: {
    to: string;
    subject: string;
    html: string;
    text: string;
    qrPng: Buffer | null;
    qrContentId: string;
    idempotencyKey: string;
  }): Promise<EmailResult>;
  sendSms(args: { to: string; body: string; idempotencyKey: string }): Promise<SmsResult>;
}

export type SendOutcome = {
  channel: SendChannel;
  result: "sent" | "failed" | "skipped" | "already_sent" | "too_soon";
  reason?: string;
};

const QR_CONTENT_ID = "recovery-qr";
const UNKNOWN_OUTCOME =
  "Unknown: the request may have gone out. Check with the guest before resending.";

/** What gets stored on a send row: no guest email or phone, and a short length. */
export function safeError(message: string): string {
  return message
    .replace(/[^\s@,;<>()"']+@[^\s@,;<>()"']+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "[phone]")
    .slice(0, 200);
}

async function finishQuietly(deps: SendDeps, sendId: string, patch: Parameters<SendDeps["finish"]>[1]) {
  try {
    await deps.finish(sendId, patch);
  } catch {
    // The message already went (or was already refused). A failed bookkeeping
    // write must not turn that into an error the leader retries.
  }
}

async function sendOne(
  recovery: SendRecovery,
  channel: SendChannel,
  kind: "initial" | "resend",
  deps: SendDeps,
): Promise<SendOutcome> {
  const to = channel === "email" ? recovery.guestEmail : recovery.guestPhone;
  if (!to) return { channel, result: "skipped", reason: channel === "email" ? "no_email" : "no_phone" };
  if (channel === "sms" && !recovery.smsConsent) return { channel, result: "skipped", reason: "no_consent" };
  if (!deps.baseUrl) return { channel, result: "failed", reason: "App address is not set up (NEXT_PUBLIC_APP_URL)." };

  let sendId: string | null;
  try {
    sendId = await deps.claim(recovery.id, channel, kind);
  } catch (error) {
    return { channel, result: "failed", reason: safeError(error instanceof Error ? error.message : "Could not start the send.") };
  }
  if (!sendId) return { channel, result: kind === "initial" ? "already_sent" : "too_soon" };

  const configured = channel === "email" ? deps.emailConfigured : deps.smsConfigured;
  if (channel === "sms" && !deps.smsEnabled) {
    await finishQuietly(deps, sendId, { status: "skipped", error: "Texting is not turned on yet." });
    return { channel, result: "skipped", reason: "sms_off" };
  }
  if (!configured) {
    await finishQuietly(deps, sendId, {
      status: "skipped",
      error: channel === "email" ? "Email is not set up yet." : "Texting is not set up yet.",
    });
    return { channel, result: "skipped", reason: "not_configured" };
  }
  if (channel === "sms") {
    let optedOut = false;
    try {
      optedOut = await deps.isOptedOut(to);
    } catch {
      // Cannot tell: do not text. Fail closed.
      await finishQuietly(deps, sendId, { status: "failed", error: "Could not check opt-outs, so no text was sent." });
      return { channel, result: "failed", reason: "Could not check opt-outs." };
    }
    if (optedOut) {
      await finishQuietly(deps, sendId, { status: "skipped", error: "This number opted out of texts." });
      return { channel, result: "skipped", reason: "opted_out" };
    }
  }

  const link = recoveryLink(deps.baseUrl, recovery.token);
  const message = { guestName: recovery.guestName, orderNumber: recovery.orderNumber, items: recovery.items, link };

  try {
    if (channel === "email") {
      let qr: Buffer | null = null;
      try {
        qr = await deps.qrPng(link);
      } catch {
        qr = null; // the email still carries the button and the link
      }
      const built = buildEmail({ ...message, qrContentId: qr ? QR_CONTENT_ID : undefined });
      const result = await deps.sendEmail({
        to,
        subject: built.subject,
        html: built.html,
        text: built.text,
        qrPng: qr,
        qrContentId: QR_CONTENT_ID,
        idempotencyKey: sendId,
      });
      if (result.ok) {
        await finishQuietly(deps, sendId, { status: "sent", sentAt: new Date().toISOString() });
        return { channel, result: "sent" };
      }
      const error = safeError(result.error);
      await finishQuietly(deps, sendId, { status: "failed", error });
      return { channel, result: "failed", reason: error };
    }

    const result = await deps.sendSms({ to, body: buildSms(message), idempotencyKey: sendId });
    if (result.ok) {
      await finishQuietly(deps, sendId, { status: "sent", sentAt: new Date().toISOString() });
      return { channel, result: "sent" };
    }
    if (result.optedOut) {
      try {
        await deps.recordOptOut(to);
      } catch {
        // The carrier blocks the number anyway; the record only saves a call.
      }
      await finishQuietly(deps, sendId, { status: "skipped", error: "This number opted out of texts." });
      return { channel, result: "skipped", reason: "opted_out" };
    }
    const error = safeError(result.error);
    await finishQuietly(deps, sendId, { status: "failed", error });
    return { channel, result: "failed", reason: error };
  } catch {
    await finishQuietly(deps, sendId, { status: "failed", error: UNKNOWN_OUTCOME });
    return { channel, result: "failed", reason: UNKNOWN_OUTCOME };
  }
}

/**
 * Sends a recovery's email and text (or just `channels`). Resolves with one
 * outcome per channel and never throws.
 */
export async function runSends(
  recovery: SendRecovery,
  kind: "initial" | "resend",
  deps: SendDeps,
  channels: SendChannel[] = ["email", "sms"],
): Promise<SendOutcome[]> {
  return Promise.all(channels.map((channel) => sendOne(recovery, channel, kind, deps)));
}
