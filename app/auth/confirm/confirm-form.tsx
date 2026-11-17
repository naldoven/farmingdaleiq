"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

import { AuthAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmSetupLink, type ConfirmState } from "@/app/auth/confirm/actions";
import { createClient } from "@/lib/supabase/client";

const MIN_LENGTH = 8;

/**
 * New-password form on /auth/confirm. The token rides along in hidden fields
 * and is spent only when this form is sent (confirmSetupLink). The button is
 * disabled while sending: the token works once, so a second tap must not race
 * the first (AGENTS.md invariant 6).
 */
export function ConfirmForm({ tokenHash, type }: { tokenHash: string; type: string }) {
  const [state, formAction, isPending] = useActionState<ConfirmState, FormData>(
    confirmSetupLink,
    { error: null },
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const error = clientError ?? state.error;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        const data = new FormData(e.currentTarget);
        const password = String(data.get("password") ?? "");
        if (password.length < MIN_LENGTH) {
          e.preventDefault();
          setClientError(`Use at least ${MIN_LENGTH} characters.`);
          return;
        }
        if (password !== data.get("confirm")) {
          e.preventDefault();
          setClientError("The passwords don't match.");
          return;
        }
        setClientError(null);
      }}
    >
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />

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
          minLength={MIN_LENGTH}
          disabled={isPending}
          className="h-11 rounded-lg px-3.5 text-[16px]"
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
          disabled={isPending}
          className="h-11 rounded-lg px-3.5 text-[16px]"
        />
      </div>

      {error ? <AuthAlert>{error}</AuthAlert> : null}

      <Button type="submit" className="h-11 w-full rounded-lg text-[15px]" disabled={isPending}>
        {isPending ? "Saving..." : "Set password"}
      </Button>
    </form>
  );
}

/**
 * Signs out and stays on this page, so the link can then be used. Shown when
 * someone is already signed in on this browser: the link is not touched until
 * they do.
 */
export function SignOutHere() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full rounded-lg text-[15px]"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await createClient().auth.signOut();
          router.refresh();
        })
      }
    >
      {isPending ? "Signing out..." : "Sign out and continue"}
    </Button>
  );
}
