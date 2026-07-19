import {
  ClipboardList,
  Crown,
  Gift,
  MessageCircle,
  Repeat,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ListRow, StatusBadge, type ListRowTone, type StatusTone } from "@/components/mobile";
import { CancelTaskButton } from "@/components/tasks/cancel-task-button";
import { ClaimTaskButton } from "@/components/tasks/claim-task-button";
import { CompleteTaskButton } from "@/components/tasks/complete-task-button";
import { DelegateTaskControl, type NamedOption } from "@/components/tasks/delegate-task-control";

export interface TaskRowView {
  id: string;
  title: string;
  kind: string;
  dayPartName: string | null;
  dueAt: string | null;
  status: string;
  tokenValue: number;
  /** T3: who owns this task (person name or position name), or null when it
   * sits unassigned in the pool. Rendered in the manager "all" view so a
   * leader can see each task's owner at a glance. */
  assigneeLabel: string | null;
}

/**
 * T3: resolves the human-readable owner of a task row from its assignee ids.
 * A person assignment wins over a position assignment (the two are mutually
 * exclusive on write, but prefer the person defensively); an unassigned pool
 * task resolves to null. Pure so app/(app)/tasks/page.tsx's row mapping is
 * unit-testable without a database.
 */
export function resolveAssigneeLabel(input: {
  assignedUserId: string | null;
  assignedPositionId: string | null;
  userNameById: Map<string, string>;
  positionNameById: Map<string, string>;
}): string | null {
  if (input.assignedUserId) {
    return input.userNameById.get(input.assignedUserId) ?? "Unknown person";
  }
  if (input.assignedPositionId) {
    return input.positionNameById.get(input.assignedPositionId) ?? "Unknown position";
  }
  return null;
}

const KIND_LABELS: Record<string, string> = {
  adhoc: "Ad hoc",
  recurring: "Recurring",
  reward_fulfillment: "Reward fulfillment",
  follow_up: "Follow-up",
  lead_duty: "Lead duty",
};

const KIND_ICONS: Record<string, LucideIcon> = {
  adhoc: ClipboardList,
  recurring: Repeat,
  reward_fulfillment: Gift,
  follow_up: MessageCircle,
  lead_duty: Crown,
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  overdue: "Overdue",
  completed: "Completed",
  cancelled: "Cancelled",
};

function rowTone(status: string): ListRowTone {
  if (status === "completed") return "success";
  if (status === "overdue") return "danger";
  if (status === "cancelled") return "neutral";
  return "accent";
}

function badgeTone(status: string): StatusTone {
  if (status === "completed") return "success";
  if (status === "overdue") return "danger";
  if (status === "cancelled") return "neutral";
  return "warning";
}

/** A task can still be worked while it's pending or overdue (overdue just
 * means late). Completed/cancelled tasks are terminal. */
function isActionable(status: string): boolean {
  return status === "pending" || status === "overdue";
}

function formatDue(dueAt: string | null): string {
  if (!dueAt) return "No due time";
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return dueAt;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** The gray subtitle line: kind, day-part, due time (red when overdue), and
 * token value. In the manager "all" view it also names the task's owner
 * (T3) so a leader can see who each task is assigned to. */
function TaskMeta({ task, showAssignee }: { task: TaskRowView; showAssignee?: boolean }) {
  const overdue = task.status === "overdue";
  return (
    <>
      {KIND_LABELS[task.kind] ?? task.kind} · {task.dayPartName ?? "Any"} ·{" "}
      <span className={cn(overdue && "font-semibold text-danger")}>
        {formatDue(task.dueAt)}
      </span>{" "}
      · {task.tokenValue} {task.tokenValue === 1 ? "token" : "tokens"}
      {showAssignee && <> · {task.assigneeLabel ?? "Unassigned"}</>}
    </>
  );
}

/**
 * Renders one section of the tasks board as SectionCard/ListRow entries
 * (docs/DESIGN-SYSTEM.md). `mode` controls the trailing action:
 * - "mine": Complete button (the task is already assigned to the viewer).
 * - "pool": Claim button for anyone, plus a delegate control for managers.
 * - "all": manager view over every task today, with a Cancel button.
 */
export function TaskList({
  tasks,
  mode,
  canManage,
  users,
  positions,
}: {
  tasks: TaskRowView[];
  mode: "mine" | "pool" | "all";
  canManage: boolean;
  users: NamedOption[];
  positions: NamedOption[];
}) {
  if (tasks.length === 0) {
    return <p className="px-4 py-6 text-center text-[13px] text-muted-ink">Nothing here.</p>;
  }

  return (
    <div className="flex flex-col">
      {tasks.map((t, i) => (
        <div key={t.id} className={cn("flex flex-col gap-2", i > 0 && "border-t border-line")}>
          <ListRow
            icon={KIND_ICONS[t.kind] ?? ClipboardList}
            iconTone={rowTone(t.status)}
            title={t.title}
            description={<TaskMeta task={t} showAssignee={mode === "all"} />}
            trailing={
              <StatusBadge tone={badgeTone(t.status)} dot>
                {STATUS_LABELS[t.status] ?? t.status}
              </StatusBadge>
            }
          />

          {mode === "mine" && isActionable(t.status) && (
            <div className="flex justify-end px-4 pb-3">
              <CompleteTaskButton taskId={t.id} />
            </div>
          )}

          {mode === "pool" && isActionable(t.status) && (
            <div className="flex flex-wrap items-center gap-2 px-4 pb-3 pl-[4.25rem]">
              <ClaimTaskButton taskId={t.id} />
              {canManage && (
                <DelegateTaskControl taskId={t.id} users={users} positions={positions} />
              )}
            </div>
          )}

          {mode === "all" && canManage && t.status !== "completed" && (
            <div className="flex justify-end px-4 pb-3">
              <CancelTaskButton taskId={t.id} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
