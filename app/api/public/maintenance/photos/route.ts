import { NextRequest, NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";

const BUCKET = "maintenance-photos";
// Vercel Functions reject request bodies above 4.5 MB before this handler
// runs, so leave enough room for multipart form data.
const MAX_BYTES = 4 * 1024 * 1024;
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function hasIsoBaseMediaBrand(bytes: Uint8Array) {
  if (bytes.length < 12 || !startsWith(bytes.slice(4), [0x66, 0x74, 0x79, 0x70])) return false;
  const brand = new TextDecoder().decode(bytes.slice(8, 12)).toLowerCase();
  return ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"].includes(brand);
}

export function hasMatchingImageSignature(mimeType: string, bytes: Uint8Array) {
  switch (mimeType) {
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/gif":
      return startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    case "image/webp":
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.slice(8), [0x57, 0x45, 0x42, 0x50]);
    case "image/heic":
    case "image/heif":
      return hasIsoBaseMediaBrand(bytes);
    default:
      return false;
  }
}

/**
 * Anonymous image intake for the unlisted portal. The store approved no
 * account or rate limit during beta, but the server still enforces the same
 * image-only and 4 MB upload limits as staff uploads.
 */
export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Upload a photo file." }, { status: 400 });
  }

  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a photo file." }, { status: 400 });
  }
  const extension = EXTENSION_BY_MIME[file.type];
  if (!extension) {
    return NextResponse.json({ error: "Only JPEG, PNG, WebP, GIF, HEIC, and HEIF photos are allowed." }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Photos must be under 4 MB." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasMatchingImageSignature(file.type, bytes)) {
    return NextResponse.json({ error: "The selected file is not a valid image." }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const path = `public-requests/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) {
    return NextResponse.json({ error: "Could not upload the photo. Try again." }, { status: 500 });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl }, { status: 201 });
}
