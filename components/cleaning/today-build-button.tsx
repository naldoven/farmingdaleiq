"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { buildWeekNow } from "@/app/(app)/cleaning/week-actions";
import { Button } from "@/components/ui/button";

/**
 * "Build this week" for a planner who opens Today before the Thursday-night
 * job has built the week (the very first week, say). It runs the same build
 * the job runs; tapping twice is harmless because the second tap reports the
 * week already built, and either answer refreshes the page.
 */
export function BuildWeekButton({ weekStart, label }: { weekStart: string; label: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function build() {
    setError(null);
    startTransition(async () => {
      const result = await buildWeekNow({ weekStart });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.status === "busy") {
        setError("Another build is running. Try again in a minute.");
        return;
      }
      if (result.data.status === "past") {
        setError("That week is already over.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button className="h-12 w-full rounded-lg text-[16px]" disabled={pending} onClick={build}>
        {pending ? "Building..." : label}
      </Button>
      {error ? (
        <p role="alert" className="text-[14px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
