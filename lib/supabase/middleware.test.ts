import { describe, expect, it } from "vitest";

import { isPublicPath } from "./middleware";

describe("isPublicPath", () => {
  it("allows the public maintenance page and its anonymous API routes", () => {
    expect(isPublicPath("/maintenance-log")).toBe(true);
    expect(isPublicPath("/api/public/maintenance/photos")).toBe(true);
    expect(isPublicPath("/api/public/maintenance/requests")).toBe(true);
  });

  it("lets the walkthrough photo route answer 401 JSON itself instead of redirecting", () => {
    expect(isPublicPath("/api/cleaning/walkthrough")).toBe(true);
  });

  it("lets the clean-completion photo route answer 401 JSON itself instead of redirecting", () => {
    expect(isPublicPath("/api/cleaning/complete")).toBe(true);
  });

  it("keeps private app routes behind authentication", () => {
    expect(isPublicPath("/maintenance")).toBe(false);
    expect(isPublicPath("/cleaning/walkthrough")).toBe(false);
    expect(isPublicPath("/cleaning/items")).toBe(false);
    expect(isPublicPath("/cleaning")).toBe(false);
    expect(isPublicPath("/api/cleaning/other")).toBe(false);
  });
});
