"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AuthAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setNewPassword } from "@/app/set-password/actions";

const MIN_LENGTH = 8;

/**
 * Lets a signed-in person choose a new password: someone who arrived through a
 * setup or reset link, or someone a manager gave a temporary password (the
 * middleware keeps them here until they change it). The save runs in the
 * setNewPassword server action so the temporary-password flag clears in the
 * same step. On success it lands them on the app home.
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
          const result = await setNewPassword(password);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.replace("/");
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" className="text-[13px] font-semibold text-ink">
          New password
        </Label>
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
          className="h-11 rounded-lg px-3.5 text-[15px]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm" className="text-[13px] font-semibold text-ink">
          Confirm password
        </Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={isPending}
          className="h-11 rounded-lg px-3.5 text-[15px]"
        />
      </div>

      {error ? <AuthAlert>{error}</AuthAlert> : null}

      <Button type="submit" className="h-11 w-full rounded-lg text-[15px]" disabled={isPending}>
        {isPending ? "Saving..." : "Set password"}
      </Button>
    </form>
  );
}
