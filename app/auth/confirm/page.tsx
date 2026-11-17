import type { Metadata } from "next";
import Link from "next/link";

import { AuthAlert, AuthShell } from "@/components/auth/auth-shell";
import { confirmSetupLink } from "@/app/auth/confirm/actions";
import { ContinueButton } from "@/app/auth/confirm/continue-button";

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
 * the person tapped it. Here the token is spent only by the Continue button
 * (confirmSetupLink, a POST). Public in middleware: the person has no session
 * yet.
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

  return (
    <AuthShell
      title="Choose your password"
      subtitle="Tap Continue to set your FarmingdaleIQ password. This link works once."
    >
      <form action={confirmSetupLink} className="flex flex-col gap-4">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <ContinueButton />
      </form>
    </AuthShell>
  );
}
