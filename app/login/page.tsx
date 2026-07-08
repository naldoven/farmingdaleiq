import type { Metadata } from "next";

import { AuthAlert, AuthShell } from "@/components/auth/auth-shell";
import { safeRedirect } from "@/lib/auth/safe-redirect";
import { LoginForm } from "@/app/login/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * Maps the `?error=` flag that /auth/callback appends (FIQ parity #80) to a
 * message a signed-out user can act on. Pure so it is unit-testable without
 * rendering the page. Unknown/future error codes still surface a generic
 * message instead of failing silently.
 */
export function resolveAuthErrorMessage(rawError?: string | string[]): string | null {
  const error = Array.isArray(rawError) ? rawError[0] : rawError;
  if (!error) {
    return null;
  }
  if (error === "auth") {
    return "That link is invalid or has expired. Request a new one, or sign in below.";
  }
  return "Something went wrong signing you in. Please try again.";
}

/**
 * Public sign-in page. The middleware (lib/supabase/middleware.ts) sends
 * unauthenticated users here with a `?next=` return path and bounces
 * already-authenticated users away, so this page only ever renders for the
 * logged-out case. `next` is guarded with safeRedirect before it reaches the
 * client so a crafted link can't turn login into an open redirect. /auth/
 * callback sends failed invite/recovery/magic-link exchanges here with
 * `?error=auth`, surfaced below instead of silently landing on a plain
 * sign-in form (FIQ parity #80).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeRedirect(rawNext);
  const errorMessage = resolveAuthErrorMessage(params.error);

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Use the email and password for your store account."
      banner={errorMessage ? <AuthAlert>{errorMessage}</AuthAlert> : null}
    >
      <LoginForm next={next} />
    </AuthShell>
  );
}
