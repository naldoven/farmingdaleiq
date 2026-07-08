import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/app/forgot-password/forgot-password-form";

export const metadata: Metadata = {
  title: "Reset password",
};

/**
 * Public password-reset request page. Added to middleware PUBLIC_PATHS so a
 * locked-out (logged-out) user can reach it.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to set a new password."
      footer={
        <p className="text-center text-[15px] text-muted-ink">
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
