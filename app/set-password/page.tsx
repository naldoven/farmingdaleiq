import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { SetPasswordForm } from "@/app/set-password/set-password-form";

export const metadata: Metadata = {
  title: "Set your password",
};

/**
 * Password setup for invited employees and password resets. This page stays
 * behind auth (it is NOT in middleware's PUBLIC_PATHS): the /auth/callback
 * handler exchanges the invite/recovery code for a real session before
 * redirecting here, so the user is already authenticated by the time they
 * arrive and the standard middleware guard lets them through.
 */
export default function SetPasswordPage() {
  return (
    <AuthShell
      title="Set your password"
      subtitle="Choose a password to finish setting up your account."
    >
      <SetPasswordForm />
    </AuthShell>
  );
}
