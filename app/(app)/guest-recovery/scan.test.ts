import { describe, expect, it } from "vitest";

import { extractRecoveryToken } from "@/app/(app)/guest-recovery/scan";

const TOKEN = "0123456789abcdef".repeat(4);

describe("extractRecoveryToken", () => {
  it("reads the token out of the guest's link", () => {
    expect(extractRecoveryToken(`https://app.example.com/recover/${TOKEN}`)).toBe(TOKEN);
    expect(extractRecoveryToken(`https://app.example.com/recover/${TOKEN}/`)).toBe(TOKEN);
    expect(extractRecoveryToken(`  https://app.example.com/recover/${TOKEN}?x=1 `)).toBe(TOKEN);
  });

  it("accepts the bare code, any case, with stray spaces", () => {
    expect(extractRecoveryToken(TOKEN)).toBe(TOKEN);
    expect(extractRecoveryToken(` ${TOKEN.toUpperCase()} `)).toBe(TOKEN);
  });

  it("finds a link inside pasted text", () => {
    expect(extractRecoveryToken(`Here you go: https://x.test/recover/${TOKEN} thanks`)).toBe(TOKEN);
  });

  it("rejects anything that is not a recovery code", () => {
    expect(extractRecoveryToken("")).toBeNull();
    expect(extractRecoveryToken("hello")).toBeNull();
    expect(extractRecoveryToken("https://evil.example/login")).toBeNull();
    expect(extractRecoveryToken(`https://app.example.com/other/${TOKEN}`)).toBeNull();
    expect(extractRecoveryToken(TOKEN.slice(0, 63))).toBeNull();
    expect(extractRecoveryToken(`${TOKEN}a`)).toBeNull();
    expect(extractRecoveryToken(`g${TOKEN.slice(1)}`)).toBeNull();
  });

  it("never returns anything but 64 lowercase hex characters", () => {
    const got = extractRecoveryToken(`https://app.example.com/recover/${TOKEN.toUpperCase()}`);
    expect(got).toMatch(/^[0-9a-f]{64}$/);
  });
});
