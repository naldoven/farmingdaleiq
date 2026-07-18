import Link from "next/link";

import { Wordmark } from "@/components/mobile/app-header";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Page not found",
};

/**
 * App-wide custom 404 (PWA-F1). Renders inside the root layout only (not the
 * app shell), so it lays out its own centered frame the way the auth screens
 * do, and links back to home.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-6 bg-canvas px-4 py-12 text-center">
      <Wordmark className="text-[28px]" />
      <div className="flex flex-col gap-1.5">
        <p className="text-[52px] font-extrabold leading-none text-accent">404</p>
        <h1 className="text-[22px] font-bold text-ink">Page not found</h1>
        <p className="text-[15px] text-muted-ink">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
      </div>
      <Button asChild className="rounded-lg">
        <Link href="/">Back to Home</Link>
      </Button>
    </main>
  );
}
