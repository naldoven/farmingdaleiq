"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { HScroll, StatusBadge } from "@/components/mobile";
import { OrderCard, type OrderCardData } from "@/components/catering/order-card";
import { ORDER_STAGE_LABELS, ORDER_STAGES, type OrderStage } from "@/app/(app)/catering/logic";
import { changeStage } from "@/app/(app)/catering/actions";
import { cn } from "@/lib/utils";

/**
 * Pipeline board: one horizontally-scrollable column per stage, drag a card
 * between columns to move it (ARCHITECTURE.md: "every open order sits on a
 * kanban board with stages New -> Confirmation call -> FOH Setup ->
 * Pickup/Delivery -> Follow-up -> Closed. Cards move by drag or a stage
 * dropdown"). The row of columns scrolls sideways in its own container so the
 * page body never scrolls horizontally.
 */
export function KanbanBoard({ orders }: { orders: OrderCardData[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragOverStage, setDragOverStage] = useState<OrderStage | null>(null);

  const byStage = (stage: OrderStage) => orders.filter((o) => o.stage === stage);

  return (
    <HScroll snap="start">
      {ORDER_STAGES.map((stage) => {
        const stageOrders = byStage(stage);
        return (
          <div
            key={stage}
            className={cn(
              "flex w-[264px] flex-col gap-3 rounded-2xl p-1.5 transition-colors",
              dragOverStage === stage && "bg-accent-soft/60 ring-2 ring-accent/40",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStage(stage);
            }}
            onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverStage(null);
              const orderId = e.dataTransfer.getData("text/plain");
              if (!orderId) return;
              startTransition(async () => {
                await changeStage({ orderId, toStage: stage });
                router.refresh();
              });
            }}
          >
            <div className="flex items-center justify-between px-1.5">
              <h3 className="text-[15px] font-semibold text-ink">{ORDER_STAGE_LABELS[stage]}</h3>
              <StatusBadge tone="neutral">{stageOrders.length}</StatusBadge>
            </div>
            <div className="flex flex-col gap-3">
              {stageOrders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
              {stageOrders.length === 0 && (
                <p className="px-1.5 text-[13px] text-muted-ink">No orders.</p>
              )}
            </div>
          </div>
        );
      })}
    </HScroll>
  );
}
