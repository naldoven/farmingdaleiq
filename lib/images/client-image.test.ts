import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canvasToJpegBlob,
  CLEANING_PHOTO,
  computeTargetDimensions,
  downscaleImageToJpeg,
  readUploadErrorMessage,
} from "./client-image";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CLEANING_PHOTO", () => {
  it("is 1600 px at JPEG 0.8 (about 130 KB a photo in the Quote Tool measurements)", () => {
    expect(CLEANING_PHOTO).toEqual({ maxEdge: 1600, quality: 0.8 });
  });
});

describe("computeTargetDimensions", () => {
  it("leaves an image already inside the cap untouched", () => {
    expect(computeTargetDimensions(1280, 720, 1600)).toEqual({ width: 1280, height: 720 });
  });

  it("leaves an image exactly at the cap untouched", () => {
    expect(computeTargetDimensions(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
    expect(computeTargetDimensions(900, 1600, 1600)).toEqual({ width: 900, height: 1600 });
  });

  it("never upscales a small image", () => {
    expect(computeTargetDimensions(400, 300, 1600)).toEqual({ width: 400, height: 300 });
  });

  it("scales a landscape image so its width becomes the cap", () => {
    expect(computeTargetDimensions(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    // A typical 12 MP phone frame.
    expect(computeTargetDimensions(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it("scales a portrait image so its height becomes the cap", () => {
    expect(computeTargetDimensions(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(computeTargetDimensions(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it("scales a square image on both edges", () => {
    expect(computeTargetDimensions(3000, 3000, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it("keeps the aspect ratio within a pixel when the math is not clean", () => {
    // 4000x3001 -> 1600 x 1200.4 -> 1200
    expect(computeTargetDimensions(4000, 3001, 1600)).toEqual({ width: 1600, height: 1200 });
    // 1080x1920 portrait video frame -> 900x1600
    expect(computeTargetDimensions(1080, 1920, 1600)).toEqual({ width: 900, height: 1600 });
  });

  it("returns whole pixels and never exceeds the cap, across many shapes", () => {
    for (const [w, h] of [
      [4032, 3024],
      [3024, 4032],
      [4001, 2999],
      [5472, 3648],
      [1921, 1081],
      [7000, 1234],
      [1234, 7000],
      [1601, 1601],
    ]) {
      const out = computeTargetDimensions(w, h, 1600);
      expect(Number.isInteger(out.width)).toBe(true);
      expect(Number.isInteger(out.height)).toBe(true);
      expect(Math.max(out.width, out.height)).toBe(1600);
      // Rounding moves the short edge by at most half a pixel, so the ratio
      // can drift by at most about ratio * 0.5 / shortEdge.
      const ratio = Math.max(w, h) / Math.min(w, h);
      const drift = Math.abs(out.width / out.height - w / h);
      expect(drift).toBeLessThan((0.6 * ratio) / Math.min(out.width, out.height));
    }
  });

  it("never rounds an extreme panorama down to a zero-pixel edge", () => {
    expect(computeTargetDimensions(100000, 10, 1600)).toEqual({ width: 1600, height: 1 });
  });

  it("rounds a fractional input to whole pixels even when no resize is needed", () => {
    expect(computeTargetDimensions(800.4, 600.6, 1600)).toEqual({ width: 800, height: 601 });
  });

  it("does not throw on a degenerate image, and does not invent a size", () => {
    expect(computeTargetDimensions(0, 0, 1600)).toEqual({ width: 0, height: 0 });
  });

  it("ignores a nonsense cap instead of collapsing the photo to 1x1", () => {
    expect(computeTargetDimensions(4000, 3000, 0)).toEqual({ width: 4000, height: 3000 });
    expect(computeTargetDimensions(4000, 3000, -5)).toEqual({ width: 4000, height: 3000 });
    expect(computeTargetDimensions(4000, 3000, Number.NaN)).toEqual({ width: 4000, height: 3000 });
  });
});

describe("canvasToJpegBlob", () => {
  it("asks the canvas for a JPEG at the given quality and resolves its blob", async () => {
    const jpeg = new Blob(["jpeg"], { type: "image/jpeg" });
    const toBlob = vi.fn((cb: BlobCallback) => cb(jpeg));
    const canvas = { toBlob } as unknown as HTMLCanvasElement;

    await expect(canvasToJpegBlob(canvas, 0.8)).resolves.toBe(jpeg);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.8);
  });

  it("rejects when the browser yields null", async () => {
    const canvas = { toBlob: (cb: BlobCallback) => cb(null) } as unknown as HTMLCanvasElement;
    await expect(canvasToJpegBlob(canvas, 0.8)).rejects.toThrow();
  });

  it("rejects when toBlob throws (a tainted canvas does this synchronously)", async () => {
    const canvas = {
      toBlob: () => {
        throw new Error("SecurityError");
      },
    } as unknown as HTMLCanvasElement;
    await expect(canvasToJpegBlob(canvas, 0.8)).rejects.toThrow("SecurityError");
  });
});

describe("downscaleImageToJpeg", () => {
  const original = new Blob(["original-bytes"], { type: "image/heic" });

  /** Wires fakes for the browser pieces jsdom does not have: a decoded
   * bitmap, and a canvas that records what was drawn and encoded. */
  function setUpBrowser(opts: {
    bitmap?: { width: number; height: number };
    encoded?: Blob | null;
    context?: boolean;
  }) {
    const bitmap = { ...(opts.bitmap ?? { width: 4000, height: 3000 }), close: vi.fn() };
    const createImageBitmapFake = vi.fn(async () => bitmap);
    vi.stubGlobal("createImageBitmap", createImageBitmapFake);

    const ctx = { drawImage: vi.fn() };
    const encoded = opts.encoded === undefined ? new Blob(["small-jpeg"], { type: "image/jpeg" }) : opts.encoded;
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => (opts.context === false ? null : ctx)),
      toBlob: vi.fn((cb: BlobCallback) => cb(encoded)),
    };
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "canvas" ? canvas : realCreateElement(tag)) as typeof document.createElement);

    return { bitmap, createImageBitmapFake, ctx, canvas, encoded };
  }

  it("decodes with orientation pinned, draws scaled to the cap, and returns the JPEG", async () => {
    const fake = setUpBrowser({});

    const out = await downscaleImageToJpeg(original);

    expect(out).toBe(fake.encoded);
    expect(fake.createImageBitmapFake).toHaveBeenCalledWith(original, { imageOrientation: "from-image" });
    expect(fake.canvas.width).toBe(1600);
    expect(fake.canvas.height).toBe(1200);
    expect(fake.ctx.drawImage).toHaveBeenCalledWith(fake.bitmap, 0, 0, 1600, 1200);
    expect(fake.canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.8);
  });

  it("frees the decoded bitmap after a successful shrink", async () => {
    const fake = setUpBrowser({});
    await downscaleImageToJpeg(original);
    expect(fake.bitmap.close).toHaveBeenCalledTimes(1);
  });

  it("uses a portrait frame's height as the long edge", async () => {
    const fake = setUpBrowser({ bitmap: { width: 3024, height: 4032 } });
    await downscaleImageToJpeg(original);
    expect([fake.canvas.width, fake.canvas.height]).toEqual([1200, 1600]);
  });

  it("does not upscale a photo already inside the cap", async () => {
    const fake = setUpBrowser({ bitmap: { width: 1280, height: 720 } });
    await downscaleImageToJpeg(original);
    expect([fake.canvas.width, fake.canvas.height]).toEqual([1280, 720]);
  });

  it("honors per-call overrides for the cap and the quality", async () => {
    const fake = setUpBrowser({});
    await downscaleImageToJpeg(original, { maxEdge: 1280, quality: 0.7 });
    expect([fake.canvas.width, fake.canvas.height]).toEqual([1280, 960]);
    expect(fake.canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.7);
  });

  it("hands back the original blob untouched when decode fails (HEIC on a browser that cannot read it)", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new DOMException("The source image could not be decoded.", "InvalidStateError");
      }),
    );
    await expect(downscaleImageToJpeg(original)).resolves.toBe(original);
  });

  it("hands back the original blob when the browser has no createImageBitmap at all", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    await expect(downscaleImageToJpeg(original)).resolves.toBe(original);
  });

  it("hands back the original blob, and still frees the bitmap, when the canvas cannot encode", async () => {
    const fake = setUpBrowser({ encoded: null });
    await expect(downscaleImageToJpeg(original)).resolves.toBe(original);
    expect(fake.bitmap.close).toHaveBeenCalledTimes(1);
  });

  it("hands back the original blob, and still frees the bitmap, when there is no 2D context", async () => {
    const fake = setUpBrowser({ context: false });
    await expect(downscaleImageToJpeg(original)).resolves.toBe(original);
    expect(fake.bitmap.close).toHaveBeenCalledTimes(1);
  });
});

describe("readUploadErrorMessage", () => {
  it("returns the { error } text from our own JSON response", async () => {
    const res = new Response(JSON.stringify({ error: "Pick an area before sending." }), { status: 400 });
    await expect(readUploadErrorMessage(res)).resolves.toBe("Pick an area before sending.");
  });

  it("turns Vercel's plain-text 413 into a friendly message, with no raw parse error", async () => {
    const res = new Response("Request Entity Too Large", { status: 413 });
    const message = await readUploadErrorMessage(res);
    expect(message).toMatch(/^Photo is too large/);
    expect(message).not.toMatch(/JSON|Unexpected token|SyntaxError/i);
  });

  it("turns an empty 413 into the same friendly message", async () => {
    await expect(readUploadErrorMessage(new Response("", { status: 413 }))).resolves.toMatch(/^Photo is too large/);
  });

  it("prefers our route's own 413 text over the platform default", async () => {
    const res = new Response(JSON.stringify({ error: "Photo is too large (limit 8 MB)." }), { status: 413 });
    await expect(readUploadErrorMessage(res)).resolves.toBe("Photo is too large (limit 8 MB).");
  });

  it("falls back to a generic message with the status for a non-JSON body", async () => {
    const res = new Response("Internal Server Error", { status: 500 });
    await expect(readUploadErrorMessage(res)).resolves.toBe("Upload failed (error 500).");
  });

  it("falls back to the generic message for an empty body", async () => {
    await expect(readUploadErrorMessage(new Response("", { status: 502 }))).resolves.toBe("Upload failed (error 502).");
  });

  it("falls back when the JSON has no usable error field", async () => {
    for (const body of [{ ok: false }, { error: 42 }, { error: "" }, { error: "   " }, { error: null }, null, "text"]) {
      const res = new Response(JSON.stringify(body), { status: 400 });
      await expect(readUploadErrorMessage(res)).resolves.toBe("Upload failed (error 400).");
    }
  });

  it("falls back when the body was already read", async () => {
    const res = new Response("x", { status: 503 });
    await res.text();
    await expect(readUploadErrorMessage(res)).resolves.toBe("Upload failed (error 503).");
  });

  it("never throws, whatever the body is", async () => {
    const res = new Response("<html>gateway timeout</html>", { status: 504 });
    await expect(readUploadErrorMessage(res)).resolves.toBe("Upload failed (error 504).");
  });
});
