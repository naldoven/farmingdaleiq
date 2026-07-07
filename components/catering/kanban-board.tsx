"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderCard, type OrderCardData } from "@/components/catering/order-card";
import { ORDER_STAGE_LABELS, ORDER_STAGES, type OrderStage } from "@/app/(app)/catering/logic";
import { changeStage } from "@/app/(app)/catering/actions";

/**
 * Pipeline board: one column per stage, drag a card between columns to move
 * it (ARCHITECTURE.md: "every open order sits on a kanban board with stages
 * New -> Confirmation call -> FOH Setup -> Pickup/Delivery -> Follow-up ->
 * Closed. Cards move by drag or a stage dropdown").
 */
export function KanbanBoard({ orders }: { orders: OrderCardData[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragOverStage, setDragOverStage] = useState<OrderStage | null>(null);

  const byStage = (stage: OrderStage) => orders.filter((o) => o.stage === stage);

  return (
    <div className="grid grid-cols-1 gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {ORDER_STAGES.map((stage) => (
        <Card
          key={stage}
          className={dragOverStage === stage ? "ring-2 ring-ring" : undefined}
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
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span>{ORDER_STAGE_LABELS[stage]}</span>
              <span className="text-muted-foreground">{byStage(stage).length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {byStage(stage).map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
            {byStage(stage).length === 0 && (
              <p className="text-xs text-muted-foreground">No orders.</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
