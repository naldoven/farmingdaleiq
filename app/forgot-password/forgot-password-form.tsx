"use client";

import { useState, useTransition } from "react";

import { AuthAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

/**
 * Requests a password-reset email. The reset link routes through
 * /auth/callback (which exchanges the recovery code for a session) and then on
 * to /set-password via the `next` param. We always show the same neutral
 * confirmation so the form can't be used to probe which emails have accounts.
 */
export function ForgotPasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <p className="rounded-xl bg-success-soft px-4 py-3 text-[15px] font-medium text-success">
        If an account exists for that email, a reset link is on its way. Check
        your inbox and follow the link to choose a new password.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const supabase = createClient();
          const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
            "/set-password",
          )}`;
          const { error: resetError } = await supabase.auth.resetPasswordForEmail(
            email.trim(),
            { redirectTo },
          );
          if (resetError) {
            setError("Something went wrong. Try again in a moment.");
            return;
          }
          setSent(true);
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email" className="text-[13px] font-semibold text-ink">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isPending}
          className="h-11 rounded-lg px-3.5 text-[15px]"
        />
      </div>

      {error ? <AuthAlert>{error}</AuthAlert> : null}

      <Button type="submit" className="h-11 w-full rounded-lg text-[15px]" disabled={isPending}>
        {isPending ? "Sending..." : "Send reset link"}
      </Button>
    </form>
  );
}
