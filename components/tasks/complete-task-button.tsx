"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { completeTask } from "@/app/(app)/tasks/actions";

/**
 * Completes a task. The server action is idempotent (see actions.ts doc
 * comment), but this also disables itself immediately on click so a
 * fast-tapping user can't fire two requests in the same render.
 */
export function CompleteTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return <span className="text-sm text-success">Completed</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await completeTask({ id: taskId });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setDone(true);
            router.refresh();
          });
        }}
      >
        {isPending ? "Completing..." : "Complete"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
