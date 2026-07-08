import { ListRow, SectionCard, StatusBadge, type StatusTone } from "@/components/mobile";

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

const STATUS_TONE: Record<string, StatusTone> = {
  open: "info",
  in_progress: "warning",
  on_hold: "danger",
  complete: "success",
  cancelled: "neutral",
};

function formatDue(dueAt: string | null): string | null {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Work order board/list (ARCHITECTURE.md "Work orders"). */
export function WorkOrderList({ workOrders }: { workOrders: WorkOrderRow[] }) {
  if (workOrders.length === 0) {
    return <p className="px-1 text-[13px] text-muted-ink">No work orders.</p>;
  }

  return (
    <SectionCard flush>
      <div className="divide-y divide-line">
        {workOrders.map((wo) => {
          const due = formatDue(wo.due_at);
          const assignee = wo.assigned_user_name ?? wo.vendor_name;
          const description = [
            wo.equipment_name,
            (wo.priority === "high" || wo.priority === "urgent") ? `${wo.priority} priority` : null,
            assignee ? `Assigned to ${assignee}` : "Unassigned",
            due ? `Due ${due}` : null,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <ListRow
              key={wo.id}
              href={`/maintenance/${wo.id}`}
              title={wo.title}
              description={description}
              trailing={
                <StatusBadge tone={STATUS_TONE[wo.status] ?? "neutral"} dot={wo.status === "complete"}>
                  {wo.status.replace("_", " ")}
                </StatusBadge>
              }
            />
          );
        })}
      </div>
    </SectionCard>
  );
}
