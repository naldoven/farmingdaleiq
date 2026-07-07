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
  const type = searchParams.get("type");
  const rawNext = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=auth", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth", origin));
  }

  // Invite and recovery both require the user to choose a password before the
  // app is useful to them. We force /set-password for those even if `next`
  // was not supplied.
  const needsPassword = type === "invite" || type === "recovery";
  const target = needsPassword ? "/set-password" : safeRedirect(rawNext);

  return NextResponse.redirect(new URL(target, origin));
}
