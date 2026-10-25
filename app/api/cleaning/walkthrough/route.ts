import { NextRequest, NextResponse } from "next/server";

import { PHOTO_BUCKET, PHOTO_MAX_BYTES } from "@/app/(app)/cleaning/constants";
import { canPlanCleaning } from "@/app/(app)/cleaning/queries";
import { walkthroughSaveSchema } from "@/app/(app)/cleaning/validation";
import { hasPermission } from "@/lib/auth/permissions";
import { hasMatchingImageSignature } from "@/lib/images/image-signature";
import { createClient } from "@/lib/supabase/server";
import { saveWalkthroughPhoto, type SaveDeps } from "./save";

/**
 * Walkthrough photo intake (docs/CLEANING-PLAN.md "Phase W"). A route, not a
 * server action, because a phone photo plus its details can pass a server
 * action's 1 MB body limit; the phone shrinks photos well under the 4 MB cap
 * here (lib/images/client-image.ts).
 *
 * Everything runs on the caller's own Supabase client, so table RLS and the
 * cleaning-photos storage policies re-check the same permission this route
 * checks. The route picks the storage path itself from the photo id.
 */
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in again to keep saving." }, { status: 401 });
  }

  const allowed = (await hasPermission("cleaning.complete")) || (await canPlanCleaning(supabase));
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "You don't have permission to do this." }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Upload a photo." }, { status: 400 });
  }

  const file = formData.get("photo");
  const rawPayload = formData.get("payload");
  if (!(file instanceof File) || typeof rawPayload !== "string") {
    return NextResponse.json({ ok: false, error: "Upload a photo." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ ok: false, error: "Only JPEG, PNG or WebP photos are allowed." }, { status: 400 });
  }
  if (file.size === 0 || file.size > PHOTO_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Photo is too large." }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return NextResponse.json({ ok: false, error: "The photo details were unreadable." }, { status: 400 });
  }
  const parsed = walkthroughSaveSchema.safeParse(payload);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).filter(Boolean).join("; ");
    return NextResponse.json({ ok: false, error: message || "Check the photo details." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasMatchingImageSignature(file.type, bytes)) {
    return NextResponse.json({ ok: false, error: "That file is not a valid image." }, { status: 400 });
  }

  const deps: SaveDeps = {
    async findPhoto(photoId) {
      const { data } = await supabase.from("cleaning_item_photos").select("item_id").eq("id", photoId).maybeSingle();
      return data ? { itemId: data.item_id } : null;
    },
    async findItem(itemId) {
      const { data } = await supabase
        .from("cleaning_items")
        .select("status, created_by")
        .eq("id", itemId)
        .maybeSingle();
      return data ? { status: data.status, createdBy: data.created_by } : null;
    },
    async upload(path, body, contentType) {
      const { error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, body, { contentType, cacheControl: "31536000", upsert: false });
      return { error: error ? { message: error.message, statusCode: (error as { statusCode?: string }).statusCode } : null };
    },
    async insertItem(row) {
      // No .select(): a RETURNING read would need the SELECT policy too (the
      // ACC1 lesson), and the id is already known.
      const { error } = await supabase.from("cleaning_items").insert(row);
      return { error };
    },
    async insertPhoto(row) {
      const { error } = await supabase.from("cleaning_item_photos").insert(row);
      return { error };
    },
  };

  try {
    const result = await saveWalkthroughPhoto(deps, parsed.data, { bytes, contentType: file.type }, user.id);
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not save. It will try again." }, { status: 500 });
  }
}
