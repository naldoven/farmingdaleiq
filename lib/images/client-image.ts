// Client-side photo shrink for the cleaning walkthrough camera. Ported from
// the Quote Tool's clientImage.ts and its crew-camera proof-photo setting.
//
// Why shrink on the phone at all: Vercel hard-caps a serverless request body
// at about 4.5 MB and rejects anything bigger at the platform layer, before
// our route runs. A raw phone frame can be several MB. The Quote Tool shipped
// raw uploads first and kept hitting that wall, so the fix lives on the
// client and every photo goes through it.
//
// Why 1600 px at 0.8: the Quote Tool camera used to keep the full 1080x1920
// frame at JPEG 0.9, about 470 KB a photo. Measured on real photos, 1600 px
// at 0.8 averaged about 131 KB (1280 px averaged about 93 KB). 1600 is still
// enough detail to zoom in on a grease trap or a floor drain, and a day of
// walkthroughs stays small on the phone queue and in storage.
export const CLEANING_PHOTO = { maxEdge: 1600, quality: 0.8 } as const;

// Proportional size for an image capped at maxEdge on its longest side.
// Never upscales: an image already inside the cap keeps its own size. Results
// are always whole pixels (canvas width and height truncate fractions).
export function computeTargetDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  // A bad cap or a degenerate image must not collapse the photo to 1x1.
  const noScale = !(longest > 0) || !(maxEdge > 0) || longest <= maxEdge;
  if (noScale) return { width: Math.round(width), height: Math.round(height) };
  return {
    width: Math.max(1, Math.round((width * maxEdge) / longest)),
    height: Math.max(1, Math.round((height * maxEdge) / longest)),
  };
}

// Promisified canvas.toBlob. toBlob hands back null when the browser cannot
// encode (out of memory on a big canvas is the usual cause), and that must be
// a rejection, not a silent empty upload.
export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob returned null"))),
      "image/jpeg",
      quality,
    );
  });
}

// Shrink one photo to a JPEG no larger than maxEdge on its longest side.
//
// Orientation is pinned to "from-image" on purpose: the canvas re-encode
// throws away EXIF for good, so an upright phone photo would otherwise land
// sideways on the server. Relying on the browser default is too much trust.
//
// Any failure hands the ORIGINAL blob back untouched (the Quote Tool's
// rule): a HEIC file on a browser that cannot decode it, or a canvas that
// cannot encode, must not cost the worker the photo. The server decides
// whether it can use the original. If it is too big, the send policy holds
// the shot for a person instead of dropping it.
export async function downscaleImageToJpeg(
  file: Blob,
  opts: { maxEdge?: number; quality?: number } = {},
): Promise<Blob> {
  const maxEdge = opts.maxEdge ?? CLEANING_PHOTO.maxEdge;
  const quality = opts.quality ?? CLEANING_PHOTO.quality;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const { width, height } = computeTargetDimensions(bitmap.width, bitmap.height, maxEdge);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2D canvas context unavailable");
      ctx.drawImage(bitmap, 0, 0, width, height);
      return await canvasToJpegBlob(canvas, quality);
    } finally {
      // Frees the decoded pixels now. A day of shots would otherwise hold
      // many full-size bitmaps until the garbage collector got around to it.
      bitmap.close();
    }
  } catch {
    return file;
  }
}

// A failed upload becomes one line a leader can read. The body is read as
// text first and only then parsed, because Vercel answers an oversized
// request with a PLAIN-TEXT "Request Entity Too Large" and status 413. Calling
// res.json() on that threw a raw SyntaxError ("Unexpected token 'R'...") that
// the Quote Tool leaked straight to staff.
//
// Our own route's { error } wins when present, even on a 413, because it can
// say something more specific than the platform can.
export async function readUploadErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  if (text) {
    try {
      const data = JSON.parse(text) as { error?: unknown } | null;
      if (data && typeof data.error === "string" && data.error.trim()) return data.error;
    } catch {
      // Not JSON: fall through to the status-based messages.
    }
  }
  if (res.status === 413) return "Photo is too large to upload.";
  return `Upload failed (error ${res.status}).`;
}
