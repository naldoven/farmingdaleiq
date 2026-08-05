import Link from "next/link";

import { StatusBadge } from "@/components/mobile";

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
 * Kanban board for work orders (replaces the flat WorkOrderList): one column
 * per lifecycle status, matching WORK_ORDER_TRANSITIONS_FOR_UI's states.
 * View-only — cards link to /maintenance/[id], where status moves live. The
 * column row horizontally snap-scrolls (the HScroll/scoreboard pattern from
 * docs/DESIGN-SYSTEM.md) so phones swipe between columns and the page body
 * never scrolls sideways; on lg+ the maintenance page widens so the columns
 * sit side by side, and long columns scroll internally instead of stretching
 * the page.
 *
 * No Cancelled column by leader preference (2026-08-05): a cancelled work
 * order drops off the board entirely; its detail page stays reachable from
 * the equipment page's work-order history.
 */

const COLUMNS: { status: string; label: string; dotClass: string }[] = [
  { status: "open", label: "Open", dotClass: "bg-info" },
  { status: "in_progress", label: "In progress", dotClass: "bg-warning" },
  { status: "on_hold", label: "On hold", dotClass: "bg-danger" },
  { status: "complete", label: "Complete", dotClass: "bg-success" },
];

function formatDue(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function WorkOrderCard({ wo }: { wo: WorkOrderRow }) {
  const due = formatDue(wo.due_at);
  const assignee = wo.assigned_user_name ?? wo.vendor_name;
  const caption = [
    wo.equipment_name,
    assignee ? `Assigned to ${assignee}` : "Unassigned",
    due ? `Due ${due}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/maintenance/${wo.id}`}
      className="block rounded-xl border border-line bg-card p-3 shadow-card transition-transform active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[15px] font-semibold text-ink">{wo.title}</p>
        {(wo.priority === "high" || wo.priority === "urgent") && (
          <StatusBadge tone={wo.priority === "urgent" ? "danger" : "warning"}>{wo.priority}</StatusBadge>
        )}
      </div>
      {caption && <p className="mt-1 text-[13px] text-muted-ink">{caption}</p>}
    </Link>
  );
}

export function WorkOrderBoard({ workOrders }: { workOrders: WorkOrderRow[] }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
      {COLUMNS.map((column) => {
        const cards = workOrders.filter((wo) => wo.status === column.status);
        return (
          <section key={column.status} className="w-[272px] shrink-0 snap-start" aria-label={column.label}>
            <div className="flex items-center gap-2 px-1 pb-2">
              <span className={`h-2 w-2 rounded-full ${column.dotClass}`} aria-hidden="true" />
              <h3 className="text-[13px] font-semibold text-ink">{column.label}</h3>
              <span className="text-[13px] text-muted-ink">{cards.length}</span>
            </div>
            <div className="flex flex-col gap-2 lg:max-h-[65vh] lg:overflow-y-auto lg:pr-1">
              {cards.length === 0 ? (
                <p className="px-1 text-[13px] text-muted-ink">None</p>
              ) : (
                cards.map((wo) => <WorkOrderCard key={wo.id} wo={wo} />)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
