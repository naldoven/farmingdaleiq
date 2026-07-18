"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Error boundary for the authenticated app (F-SET-3). Server Components that
 * call requirePermission() throw a PermissionError when the current user lacks
 * access; without this boundary that surfaced as Next's raw platform error
 * screen. Next strips server error details from the client in production (only
 * a `digest` survives), so we can't reliably tell a permission denial from any
 * other failure here — the copy stays friendly and generic, with a way back
 * home and a retry.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces the digest in the console for support without exposing details
    // to the user.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-[480px] flex-col items-center gap-4 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
        <ShieldAlert className="h-7 w-7" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[22px] font-bold text-ink">We couldn&apos;t open this page</h1>
        <p className="text-[15px] text-muted-ink">
          You might not have access to it, or something went wrong on our end. Try
          again, or head back home.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={reset} className="rounded-lg">
          Try again
        </Button>
        <Button asChild variant="outline" className="rounded-lg">
          <Link href="/">Go to Home</Link>
        </Button>
      </div>
    </div>
  );
}
