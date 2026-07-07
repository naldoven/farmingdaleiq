"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { StageSelect } from "@/components/catering/stage-select";
import type { OrderStage } from "@/app/(app)/catering/logic";

export interface OrderCardData {
  id: string;
  guestName: string;
  eventDate: string;
  eventTime: string | null;
  headcount: number | null;
  amount: number | null;
  fulfillment: string | null;
  stage: OrderStage;
}

/**
 * One kanban card. Draggable via native HTML5 drag-and-drop (dragging sets
 * `orderId` as the transfer payload, read by the column's onDrop handler in
 * kanban-board.tsx); the stage dropdown is the accessible fallback for the
 * same move (ARCHITECTURE.md: "Cards move by drag or a stage dropdown").
 */
export function OrderCard({ order }: { order: OrderCardData }) {
  return (
    <Card
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", order.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="cursor-grab active:cursor-grabbing"
    >
      <CardContent className="flex flex-col gap-2 p-3">
        <Link href={`/catering/orders/${order.id}`} className="font-medium text-primary hover:underline">
          {order.guestName}
        </Link>
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span>{order.eventDate}</span>
          {order.eventTime && <span>{order.eventTime}</span>}
          {order.headcount != null && <Badge variant="outline">{order.headcount} guests</Badge>}
          {order.fulfillment && <Badge variant="secondary">{order.fulfillment}</Badge>}
        </div>
        {order.amount != null && (
          <div className="text-sm font-medium">${order.amount.toFixed(2)}</div>
        )}
        <StageSelect orderId={order.id} stage={order.stage} />
      </CardContent>
    </Card>
  );
}
