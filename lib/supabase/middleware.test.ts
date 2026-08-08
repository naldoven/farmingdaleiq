import { describe, expect, it } from "vitest";

import { isPublicPath } from "./middleware";

describe("isPublicPath", () => {
  it("allows the public maintenance page and its anonymous API routes", () => {
    expect(isPublicPath("/maintenance-log")).toBe(true);
    expect(isPublicPath("/api/public/maintenance/photos")).toBe(true);
    expect(isPublicPath("/api/public/maintenance/requests")).toBe(true);
  });

  it("keeps private app routes behind authentication", () => {
    expect(isPublicPath("/maintenance")).toBe(false);
  });
});
