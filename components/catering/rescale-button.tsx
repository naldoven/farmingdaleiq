"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { rescaleOrderSetup } from "@/app/(app)/catering/actions";

/**
 * Builds the physical packing list, or rebuilds it from the order's current
 * receipt/menu items, without touching separate operational checklists.
 * `built` only changes the label: leaving FOH Setup is refused until a list
 * exists, so a leader on the event day needs to see "Build", not "Refresh".
 */
export function RescaleButton({ orderId, built }: { orderId: string; built: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await rescaleOrderSetup({ orderId });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {isPending ? "Working..." : built ? "Refresh setup" : "Build packing list"}
      </Button>
      {error && <p className="text-right text-[12px] text-danger" role="alert">{error}</p>}
    </div>
  );
}
