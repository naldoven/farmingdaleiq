import { NextResponse, type NextRequest } from "next/server";

import { safeRedirect } from "@/lib/auth/safe-redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth/PKCE callback for the email-link flows: invite, password recovery, and
 * magic link. Supabase redirects the browser here with a one-time `?code=`,
 * which we exchange for a real session (cookies get set on the response).
 *
 * Where the user lands afterward is driven by a `next` param that WE set when
 * initiating each flow (the forgot-password page and the invite action point
 * `next` at /set-password), falling back to the Supabase-forwarded `type`
 * (recovery/invite still need a password). safeRedirect keeps the target
 * same-origin so the callback can't be turned into an open redirect. Any
 * missing/failed code sends the user back to /login with an error flag.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const rawNext = searchParams.get("next");

  const fail = () =>
    NextResponse.redirect(new URL("/login?error=auth", origin));

  const supabase = await createClient();

  if (tokenHash) {
    // The recovery email template links here with ?token_hash=. verifyOtp needs
    // no PKCE code_verifier cookie, so the link works in any browser or device.
    // The old ?code= link only worked in the browser that requested the reset
    // (Gmail's in-app browser or a second browser failed with bad_code_verifier).
    if (type !== "recovery") return fail();
    const { error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    if (error) return fail();
    return NextResponse.redirect(new URL("/set-password", origin));
  }

  if (!code) return fail();

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) return fail();

  // Invite and recovery both require the user to choose a password before the
  // app is useful to them. We force /set-password for those even if `next`
  // was not supplied.
  const needsPassword = type === "invite" || type === "recovery";
  const target = needsPassword ? "/set-password" : safeRedirect(rawNext);

  return NextResponse.redirect(new URL(target, origin));
}
