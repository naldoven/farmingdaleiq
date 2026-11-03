import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { pickBaseUrl } from "@/lib/guest-recovery/base-url";

describe("pickBaseUrl", () => {
  it("prefers the configured app address", () => {
    expect(pickBaseUrl("evil.example", { NEXT_PUBLIC_APP_URL: "https://app.example.com/" })).toBe("https://app.example.com");
  });

  it("trusts the request host only when it is one of this deployment's own addresses", () => {
    const env = { VERCEL_URL: "fiq-abc.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "fiq.vercel.app" };
    expect(pickBaseUrl("fiq-abc.vercel.app", env)).toBe("https://fiq-abc.vercel.app");
    expect(pickBaseUrl("FIQ-ABC.vercel.app", env)).toBe("https://fiq-abc.vercel.app");
  });

  it("ignores a forged host and falls back to the production address", () => {
    const env = { VERCEL_PROJECT_PRODUCTION_URL: "fiq.vercel.app" };
    expect(pickBaseUrl("attacker.example", env)).toBe("https://fiq.vercel.app");
    expect(pickBaseUrl(null, env)).toBe("https://fiq.vercel.app");
  });

  it("allows localhost outside production only", () => {
    expect(pickBaseUrl("localhost:3000", { NODE_ENV: "development" })).toBe("http://localhost:3000");
    expect(pickBaseUrl("localhost:3000", { NODE_ENV: "production" })).toBeNull();
  });
});
