"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ORDER_STAGE_LABELS,
  ORDER_STAGES,
  nextCateringStage,
  type OrderStage,
} from "@/app/(app)/catering/logic";
import { changeStage } from "@/app/(app)/catering/actions";

/**
 * Stage-dropdown fallback for moving an order (ARCHITECTURE.md: "Cards move
 * by drag or a stage dropdown"). Used on kanban cards and the order detail
 * page. Only the next stage is selectable because changeStage refuses
 * everything else; the other stages stay listed so the leader can see where
 * the order sits in the flow. Closed and cancelled orders have no next stage,
 * so the dropdown is hidden for them (the page's stage badge already says
 * where they are, and undo is the separate manager override).
 */
export function StageSelect({
  orderId,
  stage,
  canManage,
}: {
  orderId: string;
  stage: OrderStage;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const next = nextCateringStage(stage);
  if (!canManage || !next) return null;

  return (
    <div className="flex max-w-52 flex-col items-end gap-1">
      <Select
        value={stage}
        disabled={isPending}
        onValueChange={(value) => {
          setError(null);
          startTransition(async () => {
            // The dropdown only lists the pipeline flow stages (ORDER_STAGES),
            // never the terminal `cancelled` stage (that goes through the
            // dedicated cancel action), so the value is always a flow stage.
            const result = await changeStage({
              orderId,
              toStage: value as (typeof ORDER_STAGES)[number],
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        <SelectTrigger className="h-8 text-xs" onClick={(e) => e.stopPropagation()}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent onClick={(e) => e.stopPropagation()}>
          {ORDER_STAGES.map((s) => (
            <SelectItem key={s} value={s} disabled={s !== next}>
              {ORDER_STAGE_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-right text-[12px] text-danger" role="alert">{error}</p>}
    </div>
  );
}
