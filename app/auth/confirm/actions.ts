"use server";

import { redirect } from "next/navigation";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/**
 * The "Continue" button on /auth/confirm. This is the ONLY place a setup or
 * reset link's one-time token is spent: a POST from a person's tap, never a
 * GET a link preview can make (docs/STAFF-SIGN-IN-PLAN.md, Step 2).
 *
 * Only recovery links are accepted. Setup links (lib/auth/setup-link.ts) and
 * the Forgot password email are both recovery links. verifyOtp needs no PKCE
 * cookie, so the link works on any phone or browser. A real token hash is 56
 * characters; the length cap only stops junk before it reaches Supabase.
 *
 * A link's session must end in a new password. After a successful verify the
 * account gets app_metadata.must_change_password, so the middleware holds the
 * session on /set-password until one is chosen. Without this, a manager could
 * open a subordinate's setup link and use the app as them with nothing
 * changing on the account; now doing so replaces their password, which they
 * notice the next time they sign in.
 *
 * A second tap that lands after the first one already spent the token (a slow
 * phone, before the button's disabled state loads) finds that flagged session
 * and goes on to /set-password instead of the "link expired" screen.
 */
export async function confirmSetupLink(formData: FormData): Promise<void> {
  const tokenHash = formData.get("token_hash");
  const type = formData.get("type");

  if (typeof tokenHash !== "string" || tokenHash.length === 0 || tokenHash.length > 512) {
    redirect("/login?error=auth");
  }
  if (type !== "recovery") {
    redirect("/login?error=auth");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
  if (error || !data.user) {
    const {
      data: { user: current },
    } = await supabase.auth.getUser();
    if (current?.app_metadata?.must_change_password === true) {
      redirect("/set-password");
    }
    redirect("/login?error=auth");
  }

  const { error: flagError } = await createServiceRoleClient().auth.admin.updateUserById(
    data.user.id,
    { app_metadata: { must_change_password: true } },
  );
  if (flagError) {
    // Still send them on: they are about to choose a password anyway.
    console.error("[auth/confirm] could not flag the link session:", flagError.message);
  }
  redirect("/set-password");
}
