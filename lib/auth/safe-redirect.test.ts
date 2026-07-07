import { describe, expect, it } from "vitest";

import { safeRedirect } from "./safe-redirect";

describe("safeRedirect", () => {
  it("allows a plain same-origin path", () => {
    expect(safeRedirect("/setups")).toBe("/setups");
  });

  it("allows a nested path with query and hash", () => {
    expect(safeRedirect("/people/123?tab=roles#top")).toBe(
      "/people/123?tab=roles#top",
    );
  });

  it("allows the root path", () => {
    expect(safeRedirect("/")).toBe("/");
  });

  it("rejects a protocol-relative host (//evil.com)", () => {
    expect(safeRedirect("//evil.com")).toBe("/");
  });

  it("rejects the backslash host trick (/\\evil.com)", () => {
    expect(safeRedirect("/\\evil.com")).toBe("/");
  });

  it("rejects an absolute http URL", () => {
    expect(safeRedirect("http://evil.com")).toBe("/");
  });

  it("rejects an absolute https URL", () => {
    expect(safeRedirect("https://evil.com/setups")).toBe("/");
  });

  it("rejects a scheme-relative value without a leading slash", () => {
    expect(safeRedirect("evil.com")).toBe("/");
  });

  it("rejects a javascript: scheme", () => {
    expect(safeRedirect("javascript:alert(1)")).toBe("/");
  });

  it("rejects control-character smuggling", () => {
    expect(safeRedirect("/\thttp://evil.com")).toBe("/");
    expect(safeRedirect("/\nhttp://evil.com")).toBe("/");
  });

  it("rejects empty, null, and undefined", () => {
    expect(safeRedirect("")).toBe("/");
    expect(safeRedirect(null)).toBe("/");
    expect(safeRedirect(undefined)).toBe("/");
  });

  it("uses the provided fallback when the target is unsafe", () => {
    expect(safeRedirect("//evil.com", "/login")).toBe("/login");
    expect(safeRedirect(null, "/login")).toBe("/login");
  });
});
