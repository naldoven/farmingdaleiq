import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/guest-recovery/base-url", () => ({
  resolveBaseUrl: vi.fn(async () => "https://farmingdaleiq.vercel.app"),
}));

import { resolveBaseUrl } from "@/lib/guest-recovery/base-url";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { buildSetupLink, makeSetupLink } from "./setup-link";

const mockAdmin = vi.mocked(createServiceRoleClient);
const mockBaseUrl = vi.mocked(resolveBaseUrl);

describe("buildSetupLink", () => {
  it("points at the preview-proof /auth/confirm page, never the token-spending callback", () => {
    const link = buildSetupLink("https://farmingdaleiq.vercel.app", "abc123");
    const url = new URL(link);
    expect(url.origin).toBe("https://farmingdaleiq.vercel.app");
    expect(url.pathname).toBe("/auth/confirm");
    expect(url.searchParams.get("token_hash")).toBe("abc123");
    expect(url.searchParams.get("type")).toBe("recovery");
  });

  it("encodes the token and tolerates a trailing slash on the base address", () => {
    const link = buildSetupLink("https://farmingdaleiq.vercel.app/", "a+b/c=");
    const url = new URL(link);
    expect(url.pathname).toBe("/auth/confirm");
    expect(url.searchParams.get("token_hash")).toBe("a+b/c=");
  });
});

describe("makeSetupLink", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks Supabase for a recovery link (no email is sent) and returns our own link", async () => {
    const generateLink = vi.fn(async () => ({
      data: { properties: { hashed_token: "hash-1" } },
      error: null,
    }));
    mockAdmin.mockReturnValue({ auth: { admin: { generateLink } } } as never);

    const link = await makeSetupLink("alex@example.com");

    expect(generateLink).toHaveBeenCalledWith({ type: "recovery", email: "alex@example.com" });
    expect(link).toBe("https://farmingdaleiq.vercel.app/auth/confirm?token_hash=hash-1&type=recovery");
  });

  it("throws a plain message when Supabase refuses", async () => {
    const generateLink = vi.fn(async () => ({ data: null, error: { message: "User not found" } }));
    mockAdmin.mockReturnValue({ auth: { admin: { generateLink } } } as never);

    await expect(makeSetupLink("nobody@example.com")).rejects.toThrow(
      "Could not make a setup link. Try again.",
    );
  });

  it("throws when the app address is unknown, rather than handing out a broken link", async () => {
    mockBaseUrl.mockResolvedValueOnce(null);
    const generateLink = vi.fn();
    mockAdmin.mockReturnValue({ auth: { admin: { generateLink } } } as never);

    await expect(makeSetupLink("alex@example.com")).rejects.toThrow();
    expect(generateLink).not.toHaveBeenCalled();
  });
});
