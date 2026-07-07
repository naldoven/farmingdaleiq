"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cancelTask } from "@/app/(app)/tasks/actions";

/** Leader cancels a task that's no longer needed. Idempotent server-side
 * (no-ops on an already completed task). */
export function CancelTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await cancelTask({ id: taskId });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {isPending ? "Cancelling..." : "Cancel"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
