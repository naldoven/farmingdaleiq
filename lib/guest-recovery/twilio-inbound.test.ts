import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { classifyReply, verifyTwilioSignature } from "@/lib/guest-recovery/twilio-inbound";

function sign(url: string, params: Record<string, string>, token: string): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", token).update(data).digest("base64");
}

describe("classifyReply", () => {
  it("treats Twilio's stop words as a stop, in any case and with spaces", () => {
    for (const word of ["STOP", "stop", " Stop ", "STOPALL", "unsubscribe", "CANCEL", "End", "QUIT"]) {
      expect(classifyReply(word)).toBe("stop");
    }
  });

  it("treats the start words as a start", () => {
    for (const word of ["START", "yes", "UNSTOP", " start "]) {
      expect(classifyReply(word)).toBe("start");
    }
  });

  it("recognizes help", () => {
    expect(classifyReply("HELP")).toBe("help");
    expect(classifyReply("info")).toBe("help");
  });

  it("ignores everything else, including a stop word inside a sentence", () => {
    expect(classifyReply("please stop by the store")).toBe("other");
    expect(classifyReply("thanks")).toBe("other");
    expect(classifyReply("")).toBe("other");
    expect(classifyReply(undefined)).toBe("other");
  });
});

describe("verifyTwilioSignature", () => {
  const url = "https://farmingdaleiq.vercel.app/api/inbound/twilio-sms";
  const params = { From: "+16315550100", Body: "STOP", MessageSid: "SM123" };
  const token = "test-auth-token";

  it("accepts a correctly signed request", () => {
    expect(verifyTwilioSignature(url, params, sign(url, params, token), token)).toBe(true);
  });

  it("rejects a changed body, a changed url, and a wrong token", () => {
    const good = sign(url, params, token);
    expect(verifyTwilioSignature(url, { ...params, Body: "START" }, good, token)).toBe(false);
    expect(verifyTwilioSignature(`${url}x`, params, good, token)).toBe(false);
    expect(verifyTwilioSignature(url, params, good, "other-token")).toBe(false);
  });

  it("rejects a missing signature or a missing token (fails closed)", () => {
    expect(verifyTwilioSignature(url, params, null, token)).toBe(false);
    expect(verifyTwilioSignature(url, params, sign(url, params, token), undefined)).toBe(false);
    expect(verifyTwilioSignature(url, params, "", "")).toBe(false);
  });

  it("does not throw on a signature of the wrong length", () => {
    expect(verifyTwilioSignature(url, params, "short", token)).toBe(false);
  });
});
