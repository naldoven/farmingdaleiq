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

  it("forwards a token_hash link to /auth/confirm WITHOUT spending the token", async () => {
    // A text or email app opens a link to build its preview. If this GET
    // verified the token, the preview would use it up before the person tapped
    // it (seen live 2026-11-16: every texted link verified twice in one second).
    const res = await call("token_hash=abc123&type=recovery&next=%2Fset-password");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(location(res)).toBe("/auth/confirm?token_hash=abc123&type=recovery");
  });

  it("drops a hostile next param when forwarding a token_hash link", async () => {
    const res = await call("token_hash=abc&type=recovery&next=https%3A%2F%2Fevil.com");
    expect(location(res)).toBe("/auth/confirm?token_hash=abc&type=recovery");
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
