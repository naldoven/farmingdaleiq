import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
}

const KIND_LABELS: Record<string, string> = {
  adhoc: "Ad hoc",
  recurring: "Recurring",
  reward_fulfillment: "Reward fulfillment",
  follow_up: "Follow-up",
  lead_duty: "Lead duty",
};

function statusVariant(status: string): "success" | "warning" | "outline" | "destructive" {
  if (status === "completed") return "success";
  if (status === "overdue") return "destructive";
  if (status === "cancelled") return "outline";
  return "warning";
}

function formatDue(dueAt: string | null): string {
  if (!dueAt) return "No due time";
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return dueAt;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Renders one section of the tasks board. `mode` controls the action column:
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
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Kind</TableHead>
          <TableHead>Day-part</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Tokens</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="font-medium">{t.title}</TableCell>
            <TableCell className="text-muted-foreground">
              {KIND_LABELS[t.kind] ?? t.kind}
            </TableCell>
            <TableCell className="text-muted-foreground">{t.dayPartName ?? "Any"}</TableCell>
            <TableCell className="text-muted-foreground">{formatDue(t.dueAt)}</TableCell>
            <TableCell>{t.tokenValue}</TableCell>
            <TableCell>
              <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
            </TableCell>
            <TableCell>
              {mode === "mine" && t.status === "pending" && (
                <CompleteTaskButton taskId={t.id} />
              )}
              {mode === "pool" && t.status === "pending" && (
                <div className="flex flex-col gap-2">
                  <ClaimTaskButton taskId={t.id} />
                  {canManage && (
                    <DelegateTaskControl taskId={t.id} users={users} positions={positions} />
                  )}
                </div>
              )}
              {mode === "all" && canManage && t.status !== "completed" && (
                <CancelTaskButton taskId={t.id} />
              )}
            </TableCell>
          </TableRow>
        ))}
        {tasks.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground">
              Nothing here.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
