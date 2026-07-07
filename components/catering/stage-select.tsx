"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORDER_STAGE_LABELS, ORDER_STAGES, type OrderStage } from "@/app/(app)/catering/logic";
import { changeStage } from "@/app/(app)/catering/actions";

/**
 * Stage-dropdown fallback for moving an order (ARCHITECTURE.md: "Cards move
 * by drag or a stage dropdown"). Used on kanban cards and the order detail
 * page.
 */
export function StageSelect({ orderId, stage }: { orderId: string; stage: OrderStage }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      value={stage}
      disabled={isPending}
      onValueChange={(value) => {
        startTransition(async () => {
          await changeStage({ orderId, toStage: value as OrderStage });
          router.refresh();
        });
      }}
    >
      <SelectTrigger className="h-8 text-xs" onClick={(e) => e.stopPropagation()}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {ORDER_STAGES.map((s) => (
          <SelectItem key={s} value={s}>
            {ORDER_STAGE_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
