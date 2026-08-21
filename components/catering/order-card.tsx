"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";

import { ProgressBar, SectionCard, StatusBadge } from "@/components/mobile";
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
  /** Checklist items done / total across every stage on this order, used to
   * render the card's progress bar. Both undefined (rather than 0/0) means
   * "no checklist items yet" -- the bar is hidden instead of showing 0%. */
  checklistDone?: number;
  checklistTotal?: number;
}

/**
 * One pipeline card: guest, date/time, headcount, amount, and checklist
 * progress. Draggable via Pointer Events (components/mobile/kanban-drag.tsx
 * -- `onPointerDown` is wired up by the parent KanbanBoard, which owns the
 * shared drag hook so every card and column shares one drag session); the
 * stage dropdown is the accessible fallback for the same move
 * (ARCHITECTURE.md: "Cards move by drag or a stage dropdown").
 */
export function OrderCard({
  order,
  canManage,
  onPointerDown,
  isDragging,
}: {
  order: OrderCardData;
  canManage: boolean;
  onPointerDown?: (e: ReactPointerEvent) => void;
  isDragging?: boolean;
}) {
  const hasProgress = order.checklistTotal != null && order.checklistTotal > 0;
  const progressPct = hasProgress
    ? Math.round(((order.checklistDone ?? 0) / order.checklistTotal!) * 100)
    : 0;

  return (
    <SectionCard
      onPointerDown={onPointerDown}
      className={`w-[248px] shrink-0 transition-opacity ${canManage ? "cursor-grab active:cursor-grabbing" : ""} ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/catering/orders/${order.id}`}
            className="truncate text-[15px] font-semibold text-ink hover:underline"
          >
            {order.guestName}
          </Link>
          {canManage && <GripVertical className="h-4 w-4 shrink-0 text-muted-ink" aria-hidden="true" />}
        </div>
        <p className="text-[13px] text-muted-ink">
          {order.eventDate}
          {order.eventTime ? ` · ${order.eventTime}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {order.headcount != null && (
            <StatusBadge tone="neutral">{order.headcount} guests</StatusBadge>
          )}
          {order.fulfillment && <StatusBadge tone="info">{order.fulfillment}</StatusBadge>}
        </div>
        {order.amount != null && (
          <p className="text-[19px] font-bold text-ink">${order.amount.toFixed(2)}</p>
        )}
        {hasProgress && <ProgressBar value={progressPct} tone="accent" label="Checklists" />}
        <StageSelect orderId={order.id} stage={order.stage} canManage={canManage} />
      </div>
    </SectionCard>
  );
}
