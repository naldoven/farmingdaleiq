import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SetPasswordForm } from "@/app/set-password/set-password-form";

export const metadata: Metadata = {
  title: "Set your password - FarmingdaleIQ",
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
    <main className="flex min-h-full flex-1 items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="rounded-lg bg-primary px-3 py-1 text-lg font-bold tracking-tight text-primary-foreground">
            FarmingdaleIQ
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Set your password</CardTitle>
            <CardDescription>
              Choose a password to finish setting up your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SetPasswordForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
