"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cancelOrder } from "@/app/(app)/catering/actions";

/**
 * CAT1: cancels a catering order (erroneous / duplicate / walked away),
 * moving it to the terminal `cancelled` stage so it drops out of revenue and
 * never queues a re-book follow-up. catering.manage-gated server-side;
 * idempotent (cancelling an already-cancelled order is a no-op).
 */
export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
      >
        Cancel order
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="destructive"
          className="h-8 text-xs"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await cancelOrder({ orderId });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setConfirming(false);
              router.refresh();
            });
          }}
        >
          {isPending ? "Cancelling..." : "Confirm cancel"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          disabled={isPending}
          onClick={() => setConfirming(false)}
        >
          Keep
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
