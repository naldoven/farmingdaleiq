"use client";

import { useState, useTransition } from "react";

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
      <p className="text-sm text-muted-foreground">
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
        <Label htmlFor="email">Email</Label>
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
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Sending..." : "Send reset link"}
      </Button>
    </form>
  );
}
