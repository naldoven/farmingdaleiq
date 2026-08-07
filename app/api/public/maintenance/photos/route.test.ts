import { describe, expect, it } from "vitest";

import { hasMatchingImageSignature } from "./route";

describe("public maintenance photo signatures", () => {
  it("accepts matching JPEG bytes", () => {
    expect(hasMatchingImageSignature("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
  });

  it("rejects bytes that only claim to be an image", () => {
    expect(hasMatchingImageSignature("image/jpeg", new TextEncoder().encode("not an image"))).toBe(false);
  });

  it("accepts matching WebP bytes", () => {
    expect(hasMatchingImageSignature("image/webp", new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]))).toBe(true);
  });
});
