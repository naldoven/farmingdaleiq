import { describe, expect, it } from "vitest";

import { resolveAuthErrorMessage } from "./page";

describe("resolveAuthErrorMessage", () => {
  it("returns null when there is no error param", () => {
    expect(resolveAuthErrorMessage(undefined)).toBeNull();
  });

  it("maps the auth error code /auth/callback sends to an actionable message", () => {
    expect(resolveAuthErrorMessage("auth")).toBe(
      "That link is invalid or has expired. Request a new one, or sign in below.",
    );
  });

  it("falls back to a generic message for an unrecognized error code", () => {
    expect(resolveAuthErrorMessage("weird_code")).toBe(
      "Something went wrong signing you in. Please try again.",
    );
  });

  it("takes the first value when Next.js hands back an array", () => {
    expect(resolveAuthErrorMessage(["auth", "other"])).toBe(
      "That link is invalid or has expired. Request a new one, or sign in below.",
    );
  });
});
