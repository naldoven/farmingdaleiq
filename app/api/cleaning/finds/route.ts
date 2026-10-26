import { NextRequest, NextResponse } from "next/server";

import { PHOTO_BUCKET } from "@/app/(app)/cleaning/constants";
import { canPlanCleaning } from "@/app/(app)/cleaning/queries";
import { hasPermission } from "@/lib/auth/permissions";
import { emitEvent } from "@/lib/events/bus";
import { createClient } from "@/lib/supabase/server";
import { parseFindRequest, postFind, type FindDeps } from "./finds";

/**
 * Posting a found-and-fixed from the phone (docs/CLEANING-PLAN.md "Decisions":
 * ATD log). A route, not a server action, because a phone photo can pass a
 * server action's 1 MB body limit; the phone shrinks it well under the 4 MB
 * cap here (lib/images/client-image.ts).
 *
 * Order: signed in (401), may post (403), then the body. The poster is never
 * read from the request: cleaning_atd_finds.posted_by defaults to auth.uid(),
 * and the storage path is built from the photo id on the server. Everything
 * runs on the caller's own Supabase client, so the table and storage policies
 * re-check what this route checked.
 */
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
    return NextResponse.json({ ok: false, error: "Take a photo first." }, { status: 400 });
  }

  const parsed = await parseFindRequest(formData);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
  }

  const deps: FindDeps = {
    async zone(zoneId) {
      const { data, error } = await supabase.from("cleaning_zones").select("name, active").eq("id", zoneId).maybeSingle();
      return {
        zone: data ? { name: data.name, active: data.active } : null,
        error: error ? { code: error.code, message: error.message } : null,
      };
    },
    async upload(path, body, contentType) {
      const { error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, body, { contentType, cacheControl: "31536000", upsert: false });
      return { error: error ? { message: error.message, statusCode: (error as { statusCode?: string }).statusCode } : null };
    },
    async insert(row) {
      const { error } = await supabase.from("cleaning_atd_finds").insert(row);
      return { error: error ? { code: error.code, message: error.message } : null };
    },
    async signUrl(path, ttlSeconds) {
      const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, ttlSeconds);
      return data?.signedUrl ?? null;
    },
    async emit(payload) {
      await emitEvent("cleaning_atd_find", payload);
    },
  };

  try {
    const result = await postFind(deps, parsed.input, parsed.photo);
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not save. Tap Retry." }, { status: 500 });
  }
}
