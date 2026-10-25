import { NextRequest, NextResponse } from "next/server";

import { hasMatchingImageSignature } from "@/lib/images/image-signature";
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

// Moved to lib/images so the cleaning walkthrough route shares it; re-exported
// so this route's existing test keeps importing it from here.
export { hasMatchingImageSignature };

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
