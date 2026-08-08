import { NextRequest, NextResponse } from "next/server";

import { publicMaintenanceRequestSchema } from "@/app/maintenance-log/validation";
import { createServiceRoleClient } from "@/lib/supabase/server";

const PUBLIC_PHOTO_PATH = "/storage/v1/object/public/maintenance-photos/public-requests/";

function isPortalPhotoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return Boolean(
      supabaseUrl &&
      url.origin === new URL(supabaseUrl).origin &&
      url.pathname.startsWith(PUBLIC_PHOTO_PATH),
    );
  } catch {
    return false;
  }
}

/**
 * Account-free request intake for the unlisted maintenance portal. This is a
 * narrowly scoped service-role path instead of an anon RLS policy: callers
 * can create only a validated pending request, never read or mutate tables.
 */
export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = publicMaintenanceRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  if (!parsed.data.photoUrls.every(isPortalPhotoUrl)) {
    return NextResponse.json({ error: "Photos must be uploaded through this maintenance log." }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  if (parsed.data.equipmentId) {
    const { data: equipment, error: equipmentError } = await supabase
      .from("equipment")
      .select("id")
      .eq("id", parsed.data.equipmentId)
      .maybeSingle();
    if (equipmentError) {
      console.error("public maintenance equipment lookup failed", equipmentError.message);
      return NextResponse.json({ error: "Could not submit the request. Try again." }, { status: 500 });
    }
    if (!equipment) {
      return NextResponse.json({ error: "Select an equipment item from the list." }, { status: 400 });
    }
  }

  const { data: existing, error: existingError } = await supabase
    .from("maintenance_requests")
    .select("id")
    .eq("public_submission_id", parsed.data.submissionId)
    .maybeSingle();
  if (existingError) {
    console.error("public maintenance request duplicate lookup failed", existingError.message);
    return NextResponse.json({ error: "Could not submit the request. Try again." }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ ok: true, requestId: existing.id, duplicate: true });
  }

  const { data, error } = await supabase
    .from("maintenance_requests")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      equipment_id: parsed.data.equipmentId ?? null,
      photo_urls: parsed.data.photoUrls.length > 0 ? parsed.data.photoUrls : null,
      submitted_by: null,
      public_submission_id: parsed.data.submissionId,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      const { data: duplicate } = await supabase
        .from("maintenance_requests")
        .select("id")
        .eq("public_submission_id", parsed.data.submissionId)
        .maybeSingle();
      if (duplicate) return NextResponse.json({ ok: true, requestId: duplicate.id, duplicate: true });
    }
    if (error) console.error("public maintenance request insert failed", error.message);
    return NextResponse.json({ error: "Could not submit the request. Try again." }, { status: 500 });
  }

  // The public route has no authenticated event-bus client. Write the same
  // canonical event through the service client so existing maintenance alerts
  // still receive anonymous submissions.
  const { error: eventError } = await supabase.from("app_events").insert({
    event_key: "maint_request",
    payload: {
      requestId: data.id,
      status: "pending",
      source: "public_portal",
      title: parsed.data.title,
      message: parsed.data.description ?? "Submitted from the public maintenance log.",
    },
  });
  if (eventError) console.error("public maintenance request event failed", eventError.message);

  return NextResponse.json({ ok: true, requestId: data.id }, { status: 201 });
}
