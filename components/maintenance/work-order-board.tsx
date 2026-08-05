"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GripVertical } from "lucide-react";

import { KanbanGhostCard, StatusBadge, useKanbanDrag } from "@/components/mobile";
import { updateWorkOrderStatus } from "@/app/(app)/maintenance/actions";
import { isValidWorkOrderTransition, type WorkOrderStatus } from "@/app/(app)/maintenance/logic";

export interface WorkOrderRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  equipment_name: string | null;
  assigned_user_name: string | null;
  vendor_name: string | null;
  due_at: string | null;
}

/**
 * Kanban board for work orders: one column per lifecycle status. Cards drag
 * between columns (components/mobile/kanban-drag.tsx -- press-and-hold on
 * touch, click-drag on desktop) or link into the detail page, where the
 * same moves are also available as buttons.
 *
 * "Complete" is never a plain drag-drop: completing a work order always
 * requires recording a cost (completeWorkOrder, not updateWorkOrderStatus),
 * so dropping a card on that column opens the order instead of silently
 * failing. Terminal statuses (complete, cancelled) aren't draggable at all --
 * there's no valid transition out of either. Cancelled work orders don't
 * get a column (leader preference, 2026-08-05): a cancelled order simply
 * drops off the board; its page stays reachable from equipment history.
 */

const COLUMNS: { status: string; label: string; dotClass: string }[] = [
  { status: "open", label: "Open", dotClass: "bg-info" },
  { status: "in_progress", label: "In progress", dotClass: "bg-warning" },
  { status: "on_hold", label: "On hold", dotClass: "bg-danger" },
  { status: "complete", label: "Complete", dotClass: "bg-success" },
];

const DRAGGABLE_STATUSES = new Set(["open", "in_progress", "on_hold"]);

function formatDue(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function cardCaption(wo: WorkOrderRow): string {
  const due = formatDue(wo.due_at);
  const assignee = wo.assigned_user_name ?? wo.vendor_name;
  return [wo.equipment_name, assignee ? `Assigned to ${assignee}` : "Unassigned", due ? `Due ${due}` : null]
    .filter(Boolean)
    .join(" · ");
}

export function WorkOrderBoard({ workOrders }: { workOrders: WorkOrderRow[] }) {
  const router = useRouter();
  const [orders, setOrders] = useState(workOrders);
  const [error, setError] = useState<string | null>(null);

  // Adopt fresh server data (e.g. after router.refresh() from a successful
  // move, or any other navigation back to this page) as the new baseline.
  // Adjust-state-during-render (react.dev "You Might Not Need an Effect"):
  // comparing against the previous props value and bailing out once they
  // match makes this a one-shot sync, not a render loop.
  const [prevWorkOrders, setPrevWorkOrders] = useState(workOrders);
  if (workOrders !== prevWorkOrders) {
    setPrevWorkOrders(workOrders);
    setOrders(workOrders);
  }

  // Owned here (not returned from the hook) so the ref and the JSX built
  // around it stay inside the component that renders them -- see the
  // ownership note atop components/mobile/kanban-drag.tsx.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ghostElRef = useRef<HTMLDivElement | null>(null);

  const drag = useKanbanDrag({
    containerRef,
    ghostElRef,
    onDrop: (cardId, column) => {
      const current = orders.find((wo) => wo.id === cardId);
      if (!current || current.status === column) return;

      if (column === "complete") {
        // Completing always needs a cost, so it's never a bare status flip
        // -- open the order's own Complete form instead of failing quietly.
        router.push(`/maintenance/${cardId}`);
        return;
      }

      if (!isValidWorkOrderTransition(current.status as WorkOrderStatus, column as WorkOrderStatus)) {
        setError(`Can't move a ${current.status.replace("_", " ")} order to ${column.replace("_", " ")}.`);
        return;
      }

      setError(null);
      const previousStatus = current.status;
      setOrders((prev) => prev.map((wo) => (wo.id === cardId ? { ...wo, status: column } : wo)));

      updateWorkOrderStatus({
        workOrderId: cardId,
        status: column as "open" | "in_progress" | "on_hold" | "cancelled",
      }).then((result) => {
        if (!result.ok) {
          setOrders((prev) => prev.map((wo) => (wo.id === cardId ? { ...wo, status: previousStatus } : wo)));
          setError(result.error);
          return;
        }
        router.refresh();
      });
    },
  });

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
      <div ref={containerRef} className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
        {COLUMNS.map((column) => {
          const cards = orders.filter((wo) => wo.status === column.status);
          const isOver = drag.overColumn === column.status;
          return (
            <section
              key={column.status}
              {...drag.columnProps(column.status)}
              aria-label={column.label}
              className={`w-[272px] shrink-0 snap-start rounded-2xl p-1.5 transition-colors ${
                isOver ? "bg-accent-soft/60 ring-2 ring-accent/40" : ""
              }`}
            >
              <div className="flex items-center gap-2 px-1.5 pb-2">
                <span className={`h-2 w-2 rounded-full ${column.dotClass}`} aria-hidden="true" />
                <h3 className="text-[13px] font-semibold text-ink">{column.label}</h3>
                <span className="text-[13px] text-muted-ink">{cards.length}</span>
              </div>
              <div className="flex flex-col gap-2 lg:max-h-[65vh] lg:overflow-y-auto lg:pr-1">
                {cards.length === 0 ? (
                  <p className="px-1.5 text-[13px] text-muted-ink">None</p>
                ) : (
                  cards.map((wo) => {
                    const draggable = DRAGGABLE_STATUSES.has(wo.status);
                    const { onPointerDown } = drag.cardHandlers(
                      wo.id,
                      <KanbanGhostCard title={wo.title} caption={cardCaption(wo)} />,
                      { disabled: !draggable },
                    );
                    return (
                      <div
                        key={wo.id}
                        onPointerDown={onPointerDown}
                        className={`rounded-xl border border-line bg-card p-3 shadow-card transition-opacity ${
                          draggable ? "cursor-grab active:cursor-grabbing" : ""
                        } ${drag.draggingId === wo.id ? "opacity-40" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`/maintenance/${wo.id}`}
                            className="text-[15px] font-semibold text-ink hover:underline"
                          >
                            {wo.title}
                          </Link>
                          {draggable && (
                            <GripVertical className="h-4 w-4 shrink-0 text-muted-ink" aria-hidden="true" />
                          )}
                        </div>
                        {(wo.priority === "high" || wo.priority === "urgent") && (
                          <StatusBadge tone={wo.priority === "urgent" ? "danger" : "warning"}>
                            {wo.priority}
                          </StatusBadge>
                        )}
                        <p className="mt-1 text-[13px] text-muted-ink">{cardCaption(wo)}</p>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
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
