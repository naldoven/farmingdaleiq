"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AuthAlert } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

/**
 * Email + password sign-in form. Uses the browser Supabase client
 * (signInWithPassword) so the session cookies are set client-side, matching
 * the sign-out button's pattern. On success it navigates to `next` (already
 * validated to a safe same-origin path by the server page) and refreshes so
 * the middleware sees the new session.
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const supabase = createClient();
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (signInError) {
            setError("That email or password isn't right. Try again.");
            return;
          }
          router.replace(next);
          router.refresh();
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

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-[13px] font-semibold text-ink">
            Password
          </Label>
          <Link
            href="/forgot-password"
            className="text-[13px] font-semibold text-accent hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isPending}
          className="h-11 rounded-lg px-3.5 text-[15px]"
        />
      </div>

      {error ? <AuthAlert>{error}</AuthAlert> : null}

      <Button type="submit" className="h-11 w-full rounded-lg text-[15px]" disabled={isPending}>
        {isPending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
