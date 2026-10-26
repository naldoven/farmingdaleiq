"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hammer } from "lucide-react";

import { buildWeekNow } from "@/app/(app)/cleaning/week-actions";
import { Button } from "@/components/ui/button";

/**
 * "Build now" for a week the hourly job has not built yet. The server action
 * is safe to tap twice (the second reports the week already built), and a
 * build another caller is running reports busy instead of racing it.
 */
export function WeekBuildButton({ weekStart }: { weekStart: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function build() {
    setMessage(null);
    startTransition(async () => {
      const result = await buildWeekNow({ weekStart });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      if (result.data.status === "busy") {
        setMessage("Another build is running. Try again in a minute.");
        return;
      }
      if (result.data.status === "past") {
        setMessage("That week is over, so it can't be built.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button className="h-12 w-full rounded-lg text-[16px]" disabled={pending} onClick={build}>
        <Hammer className="size-5" aria-hidden="true" />
        {pending ? "Building..." : "Build now"}
      </Button>
      {message ? (
        <p role="alert" className="text-[14px] font-medium text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}
