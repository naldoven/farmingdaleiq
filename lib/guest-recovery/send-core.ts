import type { SendChannel } from "@/app/(app)/guest-recovery/constants";
import {
  buildEmail,
  buildSms,
  buildSpotlightEmail,
  buildSpotlightSms,
  recoveryLink,
  type MessageItem,
} from "@/lib/guest-recovery/messages";

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
  /** spotlight guests get the short "reward within 48 hours" message and no link or QR. */
  path: "standard" | "spotlight";
  /** "Good until Feb 1, 2027", added to the standard message. */
  goodUntil?: string;
  /** Name of the team member sending an app guest's reward, signed at the end of their email. */
  sentBy?: string | null;
  /** Why the guest called; changes the wording of the messages. */
  reason?: string | null;
  items: MessageItem[];
}

export type EmailResult = { ok: true } | { ok: false; error: string };
export type SmsResult = { ok: true } | { ok: false; error: string; optedOut?: boolean };

export interface SendDeps {
  /** Public address of the app, e.g. https://app.example.com. Null means the guest link cannot be built. */
  baseUrl: string | null;
  smsEnabled: boolean;
  /** Shown in the Spotlight message as the number to call. Optional. */
  storePhone?: string | null;
  emailConfigured: boolean;
  smsConfigured: boolean;
  /** Returns the new send row's id, or null when this send must not go out. */
  claim(recoveryId: string, channel: SendChannel, kind: SendKind): Promise<string | null>;
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

/** switch: a Spotlight guest whose app account did not come up gets the normal message, once. */
export type SendKind = "initial" | "resend" | "switch";

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
  kind: SendKind,
  deps: SendDeps,
): Promise<SendOutcome> {
  const to = channel === "email" ? recovery.guestEmail : recovery.guestPhone;
  if (!to) return { channel, result: "skipped", reason: channel === "email" ? "no_email" : "no_phone" };
  if (channel === "sms" && !recovery.smsConsent) return { channel, result: "skipped", reason: "no_consent" };
  const spotlight = recovery.path === "spotlight";
  // A Spotlight message has no link, so it does not need the app address.
  if (!spotlight && !deps.baseUrl) {
    return { channel, result: "failed", reason: "App address is not set up (NEXT_PUBLIC_APP_URL)." };
  }

  let sendId: string | null;
  try {
    sendId = await deps.claim(recovery.id, channel, kind);
  } catch (error) {
    return { channel, result: "failed", reason: safeError(error instanceof Error ? error.message : "Could not start the send.") };
  }
  if (!sendId) return { channel, result: kind === "resend" ? "too_soon" : "already_sent" };

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

  const link = spotlight || !deps.baseUrl ? "" : recoveryLink(deps.baseUrl, recovery.token);
  const message = {
    guestName: recovery.guestName,
    orderNumber: recovery.orderNumber,
    items: recovery.items,
    link,
    goodUntil: recovery.goodUntil,
    storePhone: deps.storePhone ?? null,
    sentBy: recovery.sentBy ?? null,
    reason: recovery.reason ?? null,
    logoUrl: deps.baseUrl ? `${deps.baseUrl.replace(/\/+$/, "")}/icons/cfa-mark-white.png` : null,
  };

  try {
    if (channel === "email") {
      let qr: Buffer | null = null;
      if (!spotlight) {
        try {
          qr = await deps.qrPng(link);
        } catch {
          qr = null; // the email still carries the button and the link
        }
      }
      const built = spotlight
        ? buildSpotlightEmail(message)
        : buildEmail({ ...message, qrContentId: qr ? QR_CONTENT_ID : undefined });
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

    const body = spotlight ? buildSpotlightSms(message) : buildSms(message);
    const result = await deps.sendSms({ to, body, idempotencyKey: sendId });
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
  kind: SendKind,
  deps: SendDeps,
  channels: SendChannel[] = ["email", "sms"],
): Promise<SendOutcome[]> {
  return Promise.all(channels.map((channel) => sendOne(recovery, channel, kind, deps)));
}
