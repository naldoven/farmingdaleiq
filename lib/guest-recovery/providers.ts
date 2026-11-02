import type { EmailResult, SmsResult } from "@/lib/guest-recovery/send-core";

/**
 * Real email and text providers for Guest Recovery, over plain fetch (no SDK).
 * Email goes through Resend from a store-owned domain; text goes through
 * Twilio. The rules about when to send live in send-core.ts; this file only
 * knows how to talk to each service, so swapping a provider later (GoHighLevel
 * for texts, say) means writing one more function with the same shape.
 *
 * Secrets come from the environment and are never put in an error message.
 */

type Env = Record<string, string | undefined>;

export interface GuestMessagingConfig {
  /** Public address of the app with no trailing slash, or null when unknown. */
  baseUrl: string | null;
  emailConfigured: boolean;
  smsConfigured: boolean;
  /** Texting stays off until carrier registration clears: GUEST_SMS_ENABLED must be exactly "true". */
  smsEnabled: boolean;
}

export function readConfig(env: Env = process.env): GuestMessagingConfig {
  const explicit = env.NEXT_PUBLIC_APP_URL?.trim();
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const rawBase = explicit || (vercel ? `https://${vercel}` : "");
  return {
    baseUrl: rawBase ? rawBase.replace(/\/+$/, "") : null,
    emailConfigured: Boolean(env.RESEND_API_KEY && env.GUEST_EMAIL_FROM),
    smsConfigured: Boolean(
      env.TWILIO_ACCOUNT_SID &&
        env.TWILIO_AUTH_TOKEN &&
        (env.TWILIO_FROM_NUMBER || env.TWILIO_MESSAGING_SERVICE_SID),
    ),
    smsEnabled: env.GUEST_SMS_ENABLED === "true",
  };
}

const REQUEST_TIMEOUT_MS = 10_000;

export async function sendResendEmail(
  args: {
    to: string;
    subject: string;
    html: string;
    text: string;
    qrPng: Buffer | null;
    qrContentId: string;
    idempotencyKey: string;
  },
  env: Env = process.env,
): Promise<EmailResult> {
  const key = env.RESEND_API_KEY;
  const from = env.GUEST_EMAIL_FROM;
  if (!key || !from) return { ok: false, error: "Email is not set up yet." };

  const body: Record<string, unknown> = {
    from,
    to: [args.to],
    subject: args.subject,
    html: args.html,
    text: args.text,
  };
  if (env.GUEST_EMAIL_REPLY_TO) body.reply_to = env.GUEST_EMAIL_REPLY_TO;
  if (args.qrPng) {
    body.attachments = [
      {
        filename: "your-code.png",
        content: args.qrPng.toString("base64"),
        content_id: args.qrContentId,
      },
    ];
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // The send row's id: Resend returns the first result for a repeat of the
      // same key instead of sending a second email.
      "Idempotency-Key": args.idempotencyKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.ok) return { ok: true };
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return { ok: false, error: payload?.message ?? `Email service answered ${response.status}.` };
}

/** Twilio's error code for a recipient who replied STOP. */
const TWILIO_UNSUBSCRIBED = 21610;

export async function sendTwilioSms(
  args: { to: string; body: string; idempotencyKey: string },
  env: Env = process.env,
): Promise<SmsResult> {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_FROM_NUMBER;
  const service = env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid || !token || (!from && !service)) return { ok: false, error: "Texting is not set up yet." };

  const form = new URLSearchParams({ To: args.to, Body: args.body });
  if (service) form.set("MessagingServiceSid", service);
  else if (from) form.set("From", from);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // Twilio has no idempotency header for messages; the once-only guarantee
      // comes from the claim row in the database (send-core.ts).
      "I-Twilio-Idempotency-Token": args.idempotencyKey,
    },
    body: form.toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.ok) return { ok: true };
  const payload = (await response.json().catch(() => null)) as { code?: number; message?: string } | null;
  if (payload?.code === TWILIO_UNSUBSCRIBED) {
    return { ok: false, error: "This number opted out of texts.", optedOut: true };
  }
  return { ok: false, error: payload?.message ?? `Text service answered ${response.status}.` };
}
