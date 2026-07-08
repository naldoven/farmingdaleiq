import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <main className="flex min-h-full flex-1 items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="rounded-lg bg-primary px-3 py-1 text-lg font-bold tracking-tight text-primary-foreground">
            FarmingdaleIQ
          </span>
          <p className="text-sm text-muted-foreground">
            Sign in to your account
          </p>
        </div>

        {errorMessage ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
          >
            {errorMessage}
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              Use the email and password for your store account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm next={next} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
