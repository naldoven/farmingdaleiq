import { NextRequest, NextResponse } from "next/server";

import { readConfig } from "@/lib/guest-recovery/providers";
import { classifyReply, verifyTwilioSignature } from "@/lib/guest-recovery/twilio-inbound";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Twilio calls this when a guest replies to a Guest Recovery text. A STOP reply
 * goes on the opt-out list the send code checks; START takes the number off it.
 * Twilio sends its own STOP and HELP confirmations, so the answer here is always
 * an empty message: replying too would text the guest twice.
 *
 * Auth: Twilio's request signature, checked with TWILIO_AUTH_TOKEN. It signs the
 * exact URL it was told to call, so set that URL in Twilio to
 * NEXT_PUBLIC_APP_URL + /api/inbound/twilio-sms. No token, or a bad signature,
 * and the request is refused.
 */

const EMPTY_REPLY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function reply(status = 200) {
  return new NextResponse(EMPTY_REPLY, { status, headers: { "Content-Type": "text/xml" } });
}

export async function POST(request: NextRequest) {
  let params: Record<string, string>;
  try {
    const form = await request.formData();
    params = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") params[key] = value;
    }
  } catch {
    return reply(400);
  }

  const base = readConfig().baseUrl;
  const url = base ? `${base}${new URL(request.url).pathname}` : request.url;
  if (!verifyTwilioSignature(url, params, request.headers.get("x-twilio-signature"), process.env.TWILIO_AUTH_TOKEN)) {
    return reply(403);
  }

  const from = params.From ?? "";
  if (!/^\+\d{8,15}$/.test(from)) return reply();

  const kind = classifyReply(params.Body);
  if (kind !== "stop" && kind !== "start") return reply();

  try {
    const client = createServiceRoleClient();
    const { error } =
      kind === "stop"
        ? await client.from("guest_sms_optouts").upsert({ phone: from }, { onConflict: "phone", ignoreDuplicates: true })
        : await client.from("guest_sms_optouts").delete().eq("phone", from);
    // A failed write answers 500 so Twilio logs it and the gap is visible.
    if (error) return reply(500);
  } catch {
    return reply(500);
  }
  return reply();
}
