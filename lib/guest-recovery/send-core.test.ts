import { describe, expect, it, vi } from "vitest";

import { runSends, safeError, type SendDeps, type SendRecovery } from "@/lib/guest-recovery/send-core";

const recovery: SendRecovery = {
  id: "11111111-1111-4111-8111-111111111111",
  token: "c".repeat(64),
  guestName: "Nolan Patrick",
  guestEmail: "nolan@example.com",
  guestPhone: "+16315550142",
  orderNumber: "8407578",
  smsConsent: true,
  path: "standard",
  goodUntil: "Good until Feb 1, 2027",
  items: [{ name: "Cobb Salad", qty: 1 }],
};

function makeDeps(overrides: Partial<SendDeps> = {}): SendDeps & {
  claim: ReturnType<typeof vi.fn>;
  finish: ReturnType<typeof vi.fn>;
  recordOptOut: ReturnType<typeof vi.fn>;
  sendEmail: ReturnType<typeof vi.fn>;
  sendSms: ReturnType<typeof vi.fn>;
} {
  const deps = {
    baseUrl: "https://app.example.com",
    smsEnabled: true,
    claim: vi.fn(async () => "send-1"),
    finish: vi.fn(async () => undefined),
    isOptedOut: vi.fn(async () => false),
    recordOptOut: vi.fn(async () => undefined),
    qrPng: vi.fn(async () => Buffer.from("png")),
    sendEmail: vi.fn(async () => ({ ok: true as const })),
    sendSms: vi.fn(async () => ({ ok: true as const })),
    emailConfigured: true,
    smsConfigured: true,
    ...overrides,
  };
  return deps as never;
}

describe("runSends: the first send", () => {
  it("sends the email and the text once each and records both as sent", async () => {
    const deps = makeDeps();
    const outcomes = await runSends(recovery, "initial", deps);
    expect(outcomes).toEqual([
      { channel: "email", result: "sent" },
      { channel: "sms", result: "sent" },
    ]);
    expect(deps.claim).toHaveBeenCalledTimes(2);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
    expect(deps.sendSms).toHaveBeenCalledTimes(1);
    expect(deps.finish).toHaveBeenCalledWith("send-1", expect.objectContaining({ status: "sent" }));
  });

  it("passes the claim id to the provider so a retry cannot double-send", async () => {
    const deps = makeDeps();
    await runSends(recovery, "initial", deps);
    expect(deps.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "send-1" }));
  });

  it("does nothing when another tap already claimed the send", async () => {
    const deps = makeDeps({ claim: vi.fn(async () => null) });
    const outcomes = await runSends(recovery, "initial", deps);
    expect(outcomes.map((o) => o.result)).toEqual(["already_sent", "already_sent"]);
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.sendSms).not.toHaveBeenCalled();
  });

  it("only emails a guest who gave no phone, and only texts one who gave no email", async () => {
    const noPhone = makeDeps();
    expect(await runSends({ ...recovery, guestPhone: null, smsConsent: false }, "initial", noPhone)).toEqual([
      { channel: "email", result: "sent" },
      { channel: "sms", result: "skipped", reason: "no_phone" },
    ]);
    expect(noPhone.claim).toHaveBeenCalledTimes(1);

    const noEmail = makeDeps();
    expect(await runSends({ ...recovery, guestEmail: null }, "initial", noEmail)).toEqual([
      { channel: "email", result: "skipped", reason: "no_email" },
      { channel: "sms", result: "sent" },
    ]);
  });
});

describe("runSends: text rules", () => {
  it("never texts a guest who did not agree to a text", async () => {
    const deps = makeDeps();
    const outcomes = await runSends({ ...recovery, smsConsent: false }, "initial", deps);
    expect(outcomes[1]).toEqual({ channel: "sms", result: "skipped", reason: "no_consent" });
    expect(deps.sendSms).not.toHaveBeenCalled();
    expect(deps.claim).toHaveBeenCalledTimes(1);
  });

  it("records the text as skipped, not failed, while texting is switched off", async () => {
    const deps = makeDeps({ smsEnabled: false });
    const outcomes = await runSends(recovery, "initial", deps);
    expect(outcomes[1]).toEqual({ channel: "sms", result: "skipped", reason: "sms_off" });
    expect(deps.sendSms).not.toHaveBeenCalled();
    expect(deps.finish).toHaveBeenCalledWith("send-1", expect.objectContaining({ status: "skipped" }));
  });

  it("never texts a number that opted out", async () => {
    const deps = makeDeps({ isOptedOut: vi.fn(async () => true) });
    const outcomes = await runSends(recovery, "initial", deps);
    expect(outcomes[1]).toEqual({ channel: "sms", result: "skipped", reason: "opted_out" });
    expect(deps.sendSms).not.toHaveBeenCalled();
  });

  it("remembers an opt-out the carrier reports", async () => {
    const deps = makeDeps({ sendSms: vi.fn(async () => ({ ok: false as const, error: "blocked", optedOut: true })) });
    const outcomes = await runSends(recovery, "initial", deps);
    expect(outcomes[1]).toEqual({ channel: "sms", result: "skipped", reason: "opted_out" });
    expect(deps.recordOptOut).toHaveBeenCalledWith("+16315550142");
  });
});

describe("runSends: things going wrong", () => {
  it("records a provider that is not set up as skipped, without calling it", async () => {
    const deps = makeDeps({ emailConfigured: false });
    const outcomes = await runSends(recovery, "initial", deps);
    expect(outcomes[0]).toEqual({ channel: "email", result: "skipped", reason: "not_configured" });
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it("claims nothing and fails clearly when the app address is not set", async () => {
    const deps = makeDeps({ baseUrl: null });
    const outcomes = await runSends(recovery, "initial", deps);
    expect(outcomes.every((o) => o.result === "failed")).toBe(true);
    expect(deps.claim).not.toHaveBeenCalled();
  });

  it("records a provider error as failed and keeps going to the other channel", async () => {
    const deps = makeDeps({ sendEmail: vi.fn(async () => ({ ok: false as const, error: "Bad key" })) });
    const outcomes = await runSends(recovery, "initial", deps);
    expect(outcomes[0]).toEqual({ channel: "email", result: "failed", reason: "Bad key" });
    expect(outcomes[1].result).toBe("sent");
    expect(deps.finish).toHaveBeenCalledWith("send-1", expect.objectContaining({ status: "failed", error: "Bad key" }));
  });

  it("treats a thrown provider call as an unknown outcome, never as safe to retry blindly", async () => {
    const deps = makeDeps({
      sendEmail: vi.fn(async () => {
        throw new Error("socket hang up");
      }),
    });
    const outcomes = await runSends(recovery, "initial", deps);
    expect(outcomes[0].result).toBe("failed");
    const [, patch] = deps.finish.mock.calls[0];
    expect(patch.status).toBe("failed");
    expect(patch.error).toMatch(/may have gone out/i);
  });

  it("does not let a claim failure on one channel stop the other", async () => {
    const claim = vi
      .fn()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce("send-2");
    const deps = makeDeps({ claim });
    const outcomes = await runSends(recovery, "initial", deps);
    expect(outcomes[0].result).toBe("failed");
    expect(outcomes[1].result).toBe("sent");
  });
});

describe("runSends: resend", () => {
  it("can send just one channel", async () => {
    const deps = makeDeps();
    const outcomes = await runSends(recovery, "resend", deps, ["email"]);
    expect(outcomes).toEqual([{ channel: "email", result: "sent" }]);
    expect(deps.claim).toHaveBeenCalledWith(recovery.id, "email", "resend");
    expect(deps.sendSms).not.toHaveBeenCalled();
  });

  it("reports a double tap as too soon", async () => {
    const deps = makeDeps({ claim: vi.fn(async () => null) });
    const outcomes = await runSends(recovery, "resend", deps, ["email"]);
    expect(outcomes).toEqual([{ channel: "email", result: "too_soon" }]);
  });
});

describe("safeError", () => {
  it("strips emails and phone numbers and caps the length", () => {
    const cleaned = safeError("Invalid to nolan@example.com or +16315550142 " + "x".repeat(400));
    expect(cleaned).not.toContain("nolan@example.com");
    expect(cleaned).not.toContain("6315550142");
    expect(cleaned.length).toBeLessThanOrEqual(200);
  });
});

describe("runSends: Spotlight path", () => {
  const spotlight = { ...recovery, path: "spotlight" as const };

  it("sends the 48-hour message with no link and no QR", async () => {
    const deps = makeDeps();
    const outcomes = await runSends(spotlight, "initial", deps);
    expect(outcomes.map((o) => o.result)).toEqual(["sent", "sent"]);
    const email = deps.sendEmail.mock.calls[0][0];
    expect(email.html + email.text).toMatch(/within 48 hours/);
    expect(email.html + email.text).not.toContain("/recover/");
    expect(email.qrPng).toBeNull();
    expect(deps.qrPng).not.toHaveBeenCalled();
    const sms = deps.sendSms.mock.calls[0][0];
    expect(sms.body).toMatch(/within 48 hours/);
    expect(sms.body).not.toContain("/recover/");
  });

  it("does not need the app address, since there is no link to build", async () => {
    const deps = makeDeps({ baseUrl: null });
    const outcomes = await runSends(spotlight, "initial", deps);
    expect(outcomes.map((o) => o.result)).toEqual(["sent", "sent"]);
  });

  it("keeps every text rule: consent, opt-out, switched off", async () => {
    const noConsent = makeDeps();
    expect((await runSends({ ...spotlight, smsConsent: false }, "initial", noConsent))[1]).toEqual({
      channel: "sms", result: "skipped", reason: "no_consent",
    });
    const optedOut = makeDeps({ isOptedOut: vi.fn(async () => true) });
    expect((await runSends(spotlight, "initial", optedOut))[1].reason).toBe("opted_out");
    const off = makeDeps({ smsEnabled: false });
    expect((await runSends(spotlight, "initial", off))[1].reason).toBe("sms_off");
  });
});

describe("runSends: switching a Spotlight guest to the normal message", () => {
  it("claims a switch send and sends the code message with the link and QR", async () => {
    const deps = makeDeps();
    const outcomes = await runSends(recovery, "switch", deps);
    expect(deps.claim).toHaveBeenCalledWith(recovery.id, "email", "switch");
    expect(deps.claim).toHaveBeenCalledWith(recovery.id, "sms", "switch");
    expect(outcomes.map((o) => o.result)).toEqual(["sent", "sent"]);
    const email = deps.sendEmail.mock.calls[0][0];
    expect(email.html + email.text).toContain("/recover/");
    expect(email.qrPng).not.toBeNull();
  });

  it("reports a second switch as already sent, not as too soon", async () => {
    const deps = makeDeps({ claim: vi.fn(async () => null) });
    const outcomes = await runSends(recovery, "switch", deps);
    expect(outcomes.map((o) => o.result)).toEqual(["already_sent", "already_sent"]);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
});

describe("runSends: the expiry date", () => {
  it("goes into the standard message", async () => {
    const deps = makeDeps();
    await runSends(recovery, "initial", deps);
    expect(deps.sendEmail.mock.calls[0][0].text).toContain("Good until Feb 1, 2027");
    expect(deps.sendSms.mock.calls[0][0].body).toContain("Good until Feb 1, 2027");
  });
});
