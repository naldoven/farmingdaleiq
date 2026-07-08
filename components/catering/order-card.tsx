"use client";

import Link from "next/link";

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
 * progress. Draggable via native HTML5 drag-and-drop (dragging sets
 * `orderId` as the transfer payload, read by the column's onDrop handler in
 * kanban-board.tsx); the stage dropdown is the accessible fallback for the
 * same move (ARCHITECTURE.md: "Cards move by drag or a stage dropdown").
 */
export function OrderCard({ order }: { order: OrderCardData }) {
  const hasProgress = order.checklistTotal != null && order.checklistTotal > 0;
  const progressPct = hasProgress
    ? Math.round(((order.checklistDone ?? 0) / order.checklistTotal!) * 100)
    : 0;

  return (
    <SectionCard
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", order.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className="w-[248px] shrink-0 cursor-grab active:cursor-grabbing"
    >
      <div className="flex flex-col gap-2">
        <Link
          href={`/catering/orders/${order.id}`}
          className="truncate text-[15px] font-semibold text-ink hover:underline"
        >
          {order.guestName}
        </Link>
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
        {/* Stops the dropdown's own click from bubbling into the card's
         * drag-start listener on some browsers. */}
        <div onClick={(e) => e.stopPropagation()}>
          <StageSelect orderId={order.id} stage={order.stage} />
        </div>
      </div>
    </SectionCard>
  );
}
