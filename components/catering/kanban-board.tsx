"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { HScroll, KanbanGhostCard, StatusBadge, useKanbanDrag } from "@/components/mobile";
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
 *
 * Drag uses components/mobile/kanban-drag.tsx (Pointer Events, so it works
 * from a touch screen) rather than native HTML5 drag-and-drop -- the
 * `draggable` attribute this board used previously never fires from a touch
 * interaction at all, so dragging silently did nothing on the phones this
 * app actually runs on. changeStage has no forward-only restriction (any
 * stage can move to any other), so unlike the maintenance work-order board
 * every column is always a valid drop target.
 */
export function KanbanBoard({ orders }: { orders: OrderCardData[] }) {
  const router = useRouter();
  const [localOrders, setLocalOrders] = useState(orders);
  const [error, setError] = useState<string | null>(null);

  // Adopt fresh server data (e.g. after router.refresh() from a successful
  // move) as the new baseline. Adjust-state-during-render (react.dev "You
  // Might Not Need an Effect"): comparing against the previous props value
  // and bailing out once they match makes this a one-shot sync, not a
  // render loop.
  const [prevOrders, setPrevOrders] = useState(orders);
  if (orders !== prevOrders) {
    setPrevOrders(orders);
    setLocalOrders(orders);
  }

  // Owned here (not returned from the hook) so the ref and the JSX built
  // around it stay inside the component that renders them -- see the
  // ownership note atop components/mobile/kanban-drag.tsx.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ghostElRef = useRef<HTMLDivElement | null>(null);

  const drag = useKanbanDrag({
    containerRef,
    ghostElRef,
    onDrop: (orderId, stage) => {
      const current = localOrders.find((o) => o.id === orderId);
      if (!current || current.stage === stage) return;

      setError(null);
      const previousStage = current.stage;
      setLocalOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, stage: stage as OrderStage } : o)),
      );

      changeStage({ orderId, toStage: stage as (typeof ORDER_STAGES)[number] }).then((result) => {
        if (!result.ok) {
          setLocalOrders((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, stage: previousStage } : o)),
          );
          setError(result.error);
          return;
        }
        router.refresh();
      });
    },
  });

  const byStage = (stage: OrderStage) => localOrders.filter((o) => o.stage === stage);

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
      <HScroll ref={containerRef} snap="start">
        {ORDER_STAGES.map((stage) => {
          const stageOrders = byStage(stage);
          const isOver = drag.overColumn === stage;
          return (
            <div
              key={stage}
              {...drag.columnProps(stage)}
              className={cn(
                "flex w-[264px] flex-col gap-3 rounded-2xl p-1.5 transition-colors",
                isOver && "bg-accent-soft/60 ring-2 ring-accent/40",
              )}
            >
              <div className="flex items-center justify-between px-1.5">
                <h3 className="text-[15px] font-semibold text-ink">{ORDER_STAGE_LABELS[stage]}</h3>
                <StatusBadge tone="neutral">{stageOrders.length}</StatusBadge>
              </div>
              <div className="flex flex-col gap-3">
                {stageOrders.map((order) => {
                  const { onPointerDown } = drag.cardHandlers(
                    order.id,
                    <KanbanGhostCard
                      title={order.guestName}
                      caption={`${order.eventDate}${order.eventTime ? ` · ${order.eventTime}` : ""}`}
                    />,
                  );
                  return (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onPointerDown={onPointerDown}
                      isDragging={drag.draggingId === order.id}
                    />
                  );
                })}
                {stageOrders.length === 0 && (
                  <p className="px-1.5 text-[13px] text-muted-ink">No orders.</p>
                )}
              </div>
            </div>
          );
        })}
      </HScroll>
      {drag.armedGhostContent &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={ghostElRef}
            style={{
              position: "fixed",
              left: 0,
              top: 0,
              zIndex: 9999,
              pointerEvents: "none",
              willChange: "transform",
            }}
          >
            {drag.armedGhostContent}
          </div>,
          document.body,
        )}
    </div>
  );
}
