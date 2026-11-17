"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export type ConfirmState = { error: string | null };

// 8 matches the set-password form; 72 is the longest password Supabase
// (bcrypt) accepts.
const confirmSchema = z.object({
  tokenHash: z.string().min(1).max(512),
  type: z.literal("recovery"),
  password: z.string().min(8, "Use at least 8 characters.").max(72, "Use 72 characters or fewer."),
});

/**
 * The form on /auth/confirm. This is the ONLY place a setup or reset link's
 * one-time token is spent: a POST from a person's tap, never a GET a link
 * preview can make (docs/STAFF-SIGN-IN-PLAN.md, Step 2).
 *
 * The token is verified and the new password saved in this one request, so a
 * link never yields a signed-in session without a new password. A manager
 * who opens a subordinate's link can only get in by replacing that person's
 * password, which the person notices, rather than holding a quiet session
 * that raw API calls could use. The password is checked before the token is
 * touched, so a typo never burns the link.
 *
 * Someone already signed in on this browser is sent home without the token
 * being touched. That stops a link swapping a signed-in person into another
 * account, and it also covers a second tap after the first one worked (the
 * first tap signed them in). The page itself asks them to sign out first.
 *
 * If Supabase refuses the password after the token is spent (its own
 * password rules), the account is flagged so the middleware holds the session
 * on /set-password until a password is chosen. Only recovery links are
 * accepted: setup links (lib/auth/setup-link.ts) and the Forgot password email
 * are both recovery links. verifyOtp needs no PKCE cookie, so the link works
 * on any phone or browser.
 */
export async function confirmSetupLink(
  _previous: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const parsed = confirmSchema.safeParse({
    tokenHash: formData.get("token_hash"),
    type: formData.get("type"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const passwordIssue = parsed.error.issues.find((issue) => issue.path[0] === "password");
    if (passwordIssue) return { error: passwordIssue.message };
    redirect("/login?error=auth");
  }
  if (formData.get("password") !== formData.get("confirm")) {
    return { error: "The passwords don't match." };
  }

  const supabase = await createClient();
  const {
    data: { user: current },
  } = await supabase.auth.getUser();
  if (current) {
    redirect("/");
  }

  const { data, error } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: parsed.data.tokenHash,
  });
  if (error || !data.user) {
    redirect("/login?error=auth");
  }

  const { error: passwordError } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (passwordError) {
    const { error: flagError } = await createServiceRoleClient().auth.admin.updateUserById(
      data.user.id,
      { app_metadata: { must_change_password: true } },
    );
    if (flagError) {
      // Never leave an unflagged session that skipped the password step.
      await supabase.auth.signOut();
      redirect("/login?error=auth");
    }
    redirect("/set-password");
  }

  redirect("/");
}
