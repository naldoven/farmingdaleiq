import { afterEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const close = vi.fn();
const createTransport = vi.fn(() => ({ sendMail, close }));
vi.mock("nodemailer", () => ({ default: { createTransport: (options: unknown) => (createTransport as unknown as (o: unknown) => unknown)(options) } }));

import {
  readConfig,
  sendGmailEmail,
  sendGuestEmail,
  sendResendEmail,
  sendTwilioSms,
} from "@/lib/guest-recovery/providers";

const emailArgs = {
  to: "nolan@example.com",
  subject: "We're sorry about your order",
  html: "<p>hi</p>",
  text: "hi",
  qrPng: Buffer.from("png-bytes"),
  qrContentId: "recovery-qr",
  idempotencyKey: "send-1",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: { status: number; body: unknown }) {
  const fetchMock = vi.fn(async () => ({
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: async () => response.body,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("readConfig", () => {
  it("reports what is set up without exposing the values", () => {
    const config = readConfig({
      RESEND_API_KEY: "re_key",
      GUEST_EMAIL_FROM: "Store <recovery@example.com>",
      TWILIO_ACCOUNT_SID: "ACxxxx",
      TWILIO_AUTH_TOKEN: "tok",
      TWILIO_FROM_NUMBER: "+16315550100",
      GUEST_SMS_ENABLED: "true",
      NEXT_PUBLIC_APP_URL: "https://app.example.com/",
    });
    expect(config.emailConfigured).toBe(true);
    expect(config.smsConfigured).toBe(true);
    expect(config.smsEnabled).toBe(true);
    expect(config.baseUrl).toBe("https://app.example.com");
  });

  it("treats a missing piece as not set up", () => {
    const config = readConfig({ RESEND_API_KEY: "re_key" });
    expect(config.emailConfigured).toBe(false);
    expect(config.smsConfigured).toBe(false);
    expect(config.smsEnabled).toBe(false);
    expect(config.baseUrl).toBeNull();
  });

  it("only switches texting on for the exact value true", () => {
    expect(readConfig({ GUEST_SMS_ENABLED: "1" }).smsEnabled).toBe(false);
    expect(readConfig({ GUEST_SMS_ENABLED: "TRUE" }).smsEnabled).toBe(false);
  });

  it("falls back to the Vercel production address", () => {
    expect(readConfig({ VERCEL_PROJECT_PRODUCTION_URL: "farmingdaleiq.vercel.app" }).baseUrl).toBe(
      "https://farmingdaleiq.vercel.app",
    );
  });

  it("accepts a Twilio messaging service instead of a number", () => {
    const config = readConfig({
      TWILIO_ACCOUNT_SID: "ACxxxx",
      TWILIO_AUTH_TOKEN: "tok",
      TWILIO_MESSAGING_SERVICE_SID: "MGxxxx",
    });
    expect(config.smsConfigured).toBe(true);
  });
});

describe("sendResendEmail", () => {
  const env = {
    RESEND_API_KEY: "re_key",
    GUEST_EMAIL_FROM: "Store <recovery@example.com>",
    GUEST_EMAIL_REPLY_TO: "store@example.com",
  };

  it("posts the message with the idempotency key and the QR as an inline attachment", async () => {
    const fetchMock = stubFetch({ status: 200, body: { id: "em_1" } });
    const result = await sendResendEmail(emailArgs, env);
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_key");
    expect(headers["Idempotency-Key"]).toBe("send-1");
    const body = JSON.parse(init.body as string);
    expect(body.to).toEqual(["nolan@example.com"]);
    expect(body.from).toBe("Store <recovery@example.com>");
    expect(body.reply_to).toBe("store@example.com");
    expect(body.attachments[0]).toMatchObject({ content_id: "recovery-qr" });
    expect(body.attachments[0].content).toBe(Buffer.from("png-bytes").toString("base64"));
  });

  it("leaves out the attachment when there is no QR", async () => {
    const fetchMock = stubFetch({ status: 200, body: {} });
    await sendResendEmail({ ...emailArgs, qrPng: null }, env);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.attachments).toBeUndefined();
  });

  it("returns the provider's message on a failure, never the key", async () => {
    stubFetch({ status: 422, body: { message: "The `to` field must be a valid email" } });
    const result = await sendResendEmail(emailArgs, env);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/valid email/);
      expect(result.error).not.toContain("re_key");
    }
  });

  it("fails clearly when email is not set up", async () => {
    const fetchMock = stubFetch({ status: 200, body: {} });
    const result = await sendResendEmail(emailArgs, {});
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sendTwilioSms", () => {
  const env = { TWILIO_ACCOUNT_SID: "ACxxxx", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM_NUMBER: "+16315550100" };

  it("posts a form-encoded message with basic auth", async () => {
    const fetchMock = stubFetch({ status: 201, body: { sid: "SM1" } });
    const result = await sendTwilioSms({ to: "+16315550142", body: "hello", idempotencyKey: "send-1" }, env);
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACxxxx/Messages.json");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("ACxxxx:tok").toString("base64")}`);
    const form = new URLSearchParams(init.body as string);
    expect(form.get("To")).toBe("+16315550142");
    expect(form.get("From")).toBe("+16315550100");
    expect(form.get("Body")).toBe("hello");
  });

  it("uses a messaging service when one is set", async () => {
    const fetchMock = stubFetch({ status: 201, body: {} });
    await sendTwilioSms(
      { to: "+16315550142", body: "hello", idempotencyKey: "k" },
      { TWILIO_ACCOUNT_SID: "ACxxxx", TWILIO_AUTH_TOKEN: "tok", TWILIO_MESSAGING_SERVICE_SID: "MGxxxx" },
    );
    const form = new URLSearchParams((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(form.get("MessagingServiceSid")).toBe("MGxxxx");
    expect(form.get("From")).toBeNull();
  });

  it("flags a number that opted out (Twilio error 21610)", async () => {
    stubFetch({ status: 400, body: { code: 21610, message: "Attempt to send to unsubscribed recipient" } });
    const result = await sendTwilioSms({ to: "+16315550142", body: "hello", idempotencyKey: "k" }, env);
    expect(result).toMatchObject({ ok: false, optedOut: true });
  });

  it("returns the provider error for any other failure", async () => {
    stubFetch({ status: 400, body: { code: 21211, message: "Invalid 'To' Phone Number" } });
    const result = await sendTwilioSms({ to: "+16315550142", body: "hello", idempotencyKey: "k" }, env);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.optedOut).toBeFalsy();
  });
});

describe("Gmail sender", () => {
  const env = { GMAIL_USER: "store@gmail.com", GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop" };

  afterEach(() => {
    sendMail.mockReset();
    close.mockReset();
    createTransport.mockClear();
  });

  it("counts Gmail as email being set up", () => {
    expect(readConfig(env).emailConfigured).toBe(true);
    expect(readConfig({ GMAIL_USER: "store@gmail.com" }).emailConfigured).toBe(false);
  });

  it("sends over SMTP with the QR inline and replies going to the store", async () => {
    sendMail.mockResolvedValue({});
    const result = await sendGmailEmail(emailArgs, env);
    expect(result).toEqual({ ok: true });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: "store@gmail.com", pass: "abcd efgh ijkl mnop" },
      }),
    );
    const message = sendMail.mock.calls[0][0];
    expect(message.to).toBe("nolan@example.com");
    expect(message.from).toEqual({ name: "Chick-fil-A Farmingdale", address: "store@gmail.com" });
    expect(message.replyTo).toBe("store@gmail.com");
    expect(message.attachments[0]).toMatchObject({ cid: "recovery-qr", contentType: "image/png" });
    expect(close).toHaveBeenCalled();
  });

  it("reports a refusal and a bad login in plain words, never the password", async () => {
    sendMail.mockRejectedValueOnce(Object.assign(new Error("550 no such user abcd efgh"), { responseCode: 550 }));
    const refused = await sendGmailEmail(emailArgs, env);
    expect(refused).toEqual({ ok: false, error: "Gmail refused the message (550)." });

    sendMail.mockRejectedValueOnce(Object.assign(new Error("Invalid login"), { code: "EAUTH" }));
    const login = await sendGmailEmail(emailArgs, env);
    expect(login.ok).toBe(false);
    if (!login.ok) expect(login.error).not.toContain("abcd");
  });

  it("lets an unclear failure throw, so the send is recorded as unknown and not retried blindly", async () => {
    sendMail.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(sendGmailEmail(emailArgs, env)).rejects.toThrow("socket hang up");
  });

  it("fails clearly when Gmail is not set up", async () => {
    expect((await sendGmailEmail(emailArgs, {})).ok).toBe(false);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("uses Resend when both are set up, Gmail otherwise", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
    sendMail.mockResolvedValue({});
    await sendGuestEmail(emailArgs, { ...env, RESEND_API_KEY: "re_key", GUEST_EMAIL_FROM: "S <r@example.com>" });
    expect(fetch).toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    await sendGuestEmail(emailArgs, env);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
