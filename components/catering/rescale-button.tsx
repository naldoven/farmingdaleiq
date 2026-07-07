"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { rescaleOrderSetup } from "@/app/(app)/catering/actions";

/**
 * Regenerates auto-scaled FOH setup / kitchen prep quantity suggestions from
 * the order's current items and headcount, appending them as new checklist
 * rows (see rescaleOrderSetup in app/(app)/catering/actions.ts for the
 * additive-not-idempotent tradeoff).
 */
export function RescaleButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await rescaleOrderSetup({ orderId });
          router.refresh();
        });
      }}
    >
      {isPending ? "Recomputing..." : "Recompute suggested quantities"}
    </Button>
  );
}
