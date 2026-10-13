"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CANCELLED_STAGE,
  ORDER_STAGE_LABELS,
  RESTORE_STAGES,
  previousCateringStage,
  type FlowStage,
  type OrderStage,
  type RestoreStage,
} from "@/app/(app)/catering/logic";
import { moveOrderBack, restoreOrder } from "@/app/(app)/catering/actions";

/**
 * Manager-only undo on the order page: "Move back" one stage for an order on
 * the pipeline, or "Restore" for a cancelled one. Both need a reason, which
 * goes into the catering stage-change event. Rendered only for holders of
 * catering.override; the server actions re-check that key, so hiding the
 * buttons is a convenience, not the control.
 */
export function StageOverrideControls({
  orderId,
  stage,
  canOverride,
}: {
  orderId: string;
  stage: OrderStage;
  canOverride: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState<RestoreStage | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const isCancelled = stage === CANCELLED_STAGE;
  const previous = previousCateringStage(stage);
  if (!canOverride || (!isCancelled && !previous)) return null;

  const close = () => {
    setOpen(false);
    setReason("");
    setTarget(undefined);
    setError(null);
  };

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 self-start text-xs"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {isCancelled ? "Restore order" : `Move back to ${ORDER_STAGE_LABELS[previous!]}`}
      </Button>
    );
  }

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = isCancelled
        ? target
          ? await restoreOrder({ orderId, toStage: target, reason })
          : { ok: false as const, error: "Pick a stage to restore to." }
        : await moveOrderBack({ orderId, fromStage: stage as FlowStage, reason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
      <p className="text-[13px] font-semibold text-ink">
        {isCancelled ? "Restore this order" : `Move back to ${ORDER_STAGE_LABELS[previous!]}`}
      </p>
      {isCancelled && (
        <Select value={target} onValueChange={(value) => setTarget(value as RestoreStage)}>
          <SelectTrigger className="h-9 text-sm" aria-label="Restore to stage">
            <SelectValue placeholder="Pick a stage" />
          </SelectTrigger>
          <SelectContent>
            {RESTORE_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {ORDER_STAGE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Input
        placeholder="Reason (required)"
        aria-label="Reason"
        value={reason}
        maxLength={300}
        onChange={(e) => setReason(e.target.value)}
        className="h-9 text-sm"
      />
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" className="h-8 text-xs" disabled={isPending} onClick={submit}>
          {isPending ? "Saving..." : isCancelled ? "Restore" : "Move back"}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" disabled={isPending} onClick={close}>
          Keep as is
        </Button>
      </div>
      {error && (
        <p className="text-[12px] text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
