import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const del = vi.fn();
const eq = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: () => ({ upsert, delete: () => ({ eq }) }),
  }),
}));

import { POST } from "@/app/api/inbound/twilio-sms/route";

const TOKEN = "test-auth-token";
const BASE = "https://farmingdaleiq.example.com";
const URL_ = `${BASE}/api/inbound/twilio-sms`;

function signed(params: Record<string, string>, token = TOKEN): NextRequest {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], URL_);
  const signature = createHmac("sha1", token).update(data).digest("base64");
  return new NextRequest(URL_, {
    method: "POST",
    headers: { "x-twilio-signature": signature, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
}

beforeEach(() => {
  vi.stubEnv("TWILIO_AUTH_TOKEN", TOKEN);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", BASE);
  upsert.mockReset().mockResolvedValue({ error: null });
  del.mockReset();
  eq.mockReset().mockResolvedValue({ error: null });
});

describe("POST /api/inbound/twilio-sms", () => {
  it("records a STOP reply and answers with an empty message", async () => {
    const res = await POST(signed({ From: "+16315550100", Body: "STOP" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<Response></Response>");
    expect(upsert).toHaveBeenCalledWith({ phone: "+16315550100" }, { onConflict: "phone", ignoreDuplicates: true });
  });

  it("takes the number off the list on START", async () => {
    const res = await POST(signed({ From: "+16315550100", Body: "start" }));
    expect(res.status).toBe(200);
    expect(eq).toHaveBeenCalledWith("phone", "+16315550100");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("does nothing for other replies and for HELP", async () => {
    for (const body of ["thanks!", "HELP"]) {
      const res = await POST(signed({ From: "+16315550100", Body: body }));
      expect(res.status).toBe(200);
    }
    expect(upsert).not.toHaveBeenCalled();
    expect(eq).not.toHaveBeenCalled();
  });

  it("refuses a request with a bad signature", async () => {
    const res = await POST(signed({ From: "+16315550100", Body: "STOP" }, "wrong-token"));
    expect(res.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses everything when the auth token is not set", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    const res = await POST(signed({ From: "+16315550100", Body: "STOP" }));
    expect(res.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("ignores a sender that is not a phone number", async () => {
    const res = await POST(signed({ From: "not-a-number", Body: "STOP" }));
    expect(res.status).toBe(200);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("answers 500 when the opt-out could not be saved, so the gap shows in Twilio's log", async () => {
    upsert.mockResolvedValue({ error: { message: "boom" } });
    const res = await POST(signed({ From: "+16315550100", Body: "STOP" }));
    expect(res.status).toBe(500);
  });
});
