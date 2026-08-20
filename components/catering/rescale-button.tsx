"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { rescaleOrderSetup } from "@/app/(app)/catering/actions";

/**
 * Rebuilds the generated physical packing list from the order's current
 * receipt/menu items without touching manager-added final checks.
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
      {isPending ? "Refreshing..." : "Refresh setup"}
    </Button>
  );
}
