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
  title: "Sign in - FarmingdaleIQ",
};

/**
 * Public sign-in page. The middleware (lib/supabase/middleware.ts) sends
 * unauthenticated users here with a `?next=` return path and bounces
 * already-authenticated users away, so this page only ever renders for the
 * logged-out case. `next` is guarded with safeRedirect before it reaches the
 * client so a crafted link can't turn login into an open redirect.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeRedirect(rawNext);

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
