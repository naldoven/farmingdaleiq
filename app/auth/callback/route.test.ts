import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { exchangeCodeForSession, verifyOtp },
  }),
}));

import { GET } from "@/app/auth/callback/route";

function call(query: string) {
  return GET(
    new Request(`https://app.example.com/auth/callback?${query}`) as never,
  );
}

function location(res: Response) {
  return new URL(res.headers.get("location") ?? "").pathname + new URL(res.headers.get("location") ?? "").search;
}

describe("/auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
    verifyOtp.mockReset().mockResolvedValue({ error: null });
  });

  it("verifies a token_hash link without any PKCE cookie, then lands on /set-password", async () => {
    const res = await call("token_hash=abc123&type=recovery&next=%2Fset-password");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc123" });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(location(res)).toBe("/set-password");
  });

  it("forces /set-password for a recovery token_hash even if next is missing or hostile", async () => {
    const res = await call("token_hash=abc&type=recovery&next=https%3A%2F%2Fevil.com");
    expect(location(res)).toBe("/set-password");
  });

  it("sends an expired or used token_hash to /login?error=auth", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired" } });
    const res = await call("token_hash=abc&type=recovery");
    expect(location(res)).toBe("/login?error=auth");
  });

  it("rejects a token_hash with an unsupported type", async () => {
    const res = await call("token_hash=abc&type=email_change");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(location(res)).toBe("/login?error=auth");
  });

  it("still exchanges a ?code= (invite and magic-link flows)", async () => {
    const res = await call("code=xyz&type=invite");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("xyz");
    expect(location(res)).toBe("/set-password");
  });

  it("sends a failed code exchange to /login?error=auth", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "bad" } });
    const res = await call("code=xyz");
    expect(location(res)).toBe("/login?error=auth");
  });

  it("sends a bare callback to /login?error=auth", async () => {
    const res = await call("next=%2Fset-password");
    expect(location(res)).toBe("/login?error=auth");
  });
});
