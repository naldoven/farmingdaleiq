import type { Metadata } from "next";
import Link from "next/link";

import { AuthAlert, AuthShell } from "@/components/auth/auth-shell";
import { ConfirmForm, SignOutHere } from "@/app/auth/confirm/confirm-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Choose your password",
};

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * Landing page for setup links and Forgot password links
 * (docs/STAFF-SIGN-IN-PLAN.md, Step 2). Opening this page does nothing to the
 * one-time token. Text and email apps open links to build a preview; when the
 * old callback spent the token on that GET, every texted link was dead before
 * the person tapped it. Here the token is spent only when the person sends the
 * new-password form (confirmSetupLink, a POST), which also saves the password.
 * Public in middleware: the person has no session yet.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const tokenHash = first(params.token_hash);
  const type = first(params.type);

  if (!tokenHash || type !== "recovery") {
    return (
      <AuthShell
        title="This link is not complete"
        footer={
          <Link href="/login" className="text-center text-[13px] font-semibold text-accent">
            Back to sign in
          </Link>
        }
      >
        <AuthAlert>This link is missing its code. Ask your manager for a new setup link.</AuthAlert>
      </AuthShell>
    );
  }

  // Someone already signed in on this browser must sign out first, so a link
  // can never swap them into another account. Reading the session spends
  // nothing.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return (
      <AuthShell
        title="You are already signed in"
        subtitle={`This phone is signed in as ${user.email ?? "someone"}. Sign out to use this link.`}
        footer={
          <Link href="/" className="text-center text-[13px] font-semibold text-accent">
            Stay signed in and go to the app
          </Link>
        }
      >
        <SignOutHere />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose your password"
      subtitle="Pick a password for FarmingdaleIQ. This link works once."
    >
      <ConfirmForm tokenHash={tokenHash} type={type} />
    </AuthShell>
  );
}
