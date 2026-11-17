import { NextResponse, type NextRequest } from "next/server";

import { safeRedirect } from "@/lib/auth/safe-redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Callback for the email-link flows. A `?token_hash=` recovery link (the
 * Forgot password email) is forwarded untouched to /auth/confirm, which
 * spends the token only when the person taps Continue. A PKCE `?code=`
 * (magic link, older invites) is exchanged here for a real session.
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

  if (tokenHash) {
    // The recovery email template (Forgot password) links here with
    // ?token_hash=. Do NOT verify on this GET: text and email apps open links
    // to build previews, and a verify here spends the one-time token before
    // the person taps it (2026-11-16: every texted link died that way). Hand
    // off to /auth/confirm, which shows a button and verifies only on that tap.
    // `next` is dropped on purpose: a recovery always ends on /set-password.
    if (type !== "recovery") return fail();
    const confirm = new URL("/auth/confirm", origin);
    confirm.searchParams.set("token_hash", tokenHash);
    confirm.searchParams.set("type", "recovery");
    return NextResponse.redirect(confirm);
  }

  if (!code) return fail();

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) return fail();

  // Invite and recovery both require the user to choose a password before the
  // app is useful to them. We force /set-password for those even if `next`
  // was not supplied.
  const needsPassword = type === "invite" || type === "recovery";
  const target = needsPassword ? "/set-password" : safeRedirect(rawNext);

  return NextResponse.redirect(new URL(target, origin));
}
