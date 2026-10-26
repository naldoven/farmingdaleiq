import { NextRequest, NextResponse } from "next/server";

import { PHOTO_BUCKET } from "@/app/(app)/cleaning/constants";
import { canPlanCleaning } from "@/app/(app)/cleaning/queries";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { completeClean, parseCompleteRequest, type CompleteDeps } from "./complete";

/**
 * Photo completion for the Today screen (docs/CLEANING-PLAN.md "Proof": one
 * after-photo per clean). A route, not a server action, because a phone photo
 * can pass a server action's 1 MB body limit; the phone shrinks it well under
 * the 4 MB cap here (lib/images/client-image.ts).
 *
 * Order: signed in (401), may complete (403), then the body. The completer is
 * never read from the request: complete_cleaning_assignment stamps auth.uid()
 * itself, and the storage path is built from the photo id on the server.
 * Everything runs on the caller's own Supabase client, so the storage insert
 * policy and the function's own permission check re-check what this route
 * checked.
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

  const parsed = await parseCompleteRequest(formData);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
  }

  const deps: CompleteDeps = {
    async upload(path, body, contentType) {
      const { error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, body, { contentType, cacheControl: "31536000", upsert: false });
      return { error: error ? { message: error.message, statusCode: (error as { statusCode?: string }).statusCode } : null };
    },
    async complete({ assignmentId, photoPath, notNeeded }) {
      const { data, error } = await supabase.rpc("complete_cleaning_assignment", {
        p_assignment_id: assignmentId,
        p_photo_path: photoPath,
        p_not_needed: notNeeded,
      });
      return {
        result: typeof data === "string" ? data : null,
        error: error ? { code: error.code, message: error.message } : null,
      };
    },
  };

  try {
    const result = await completeClean(deps, parsed.input, parsed.photo);
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not save. Tap Retry." }, { status: 500 });
  }
}
