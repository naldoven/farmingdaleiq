"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const MIN_LENGTH = 8;

/**
 * Lets a user who arrived through the auth callback (invite or password
 * recovery, so they already hold a session) choose a new password via
 * supabase.auth.updateUser. On success it lands them on the app home.
 */
export function SetPasswordForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);

        if (password.length < MIN_LENGTH) {
          setError(`Use at least ${MIN_LENGTH} characters.`);
          return;
        }
        if (password !== confirm) {
          setError("The passwords don't match.");
          return;
        }

        startTransition(async () => {
          const supabase = createClient();
          const { error: updateError } = await supabase.auth.updateUser({
            password,
          });
          if (updateError) {
            setError(updateError.message);
            return;
          }
          router.replace("/");
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isPending}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={isPending}
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Saving..." : "Set password"}
      </Button>
    </form>
  );
}
