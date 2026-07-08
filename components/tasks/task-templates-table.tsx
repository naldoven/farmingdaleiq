"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setTaskTemplateActive } from "@/app/(app)/tasks/actions";
import {
  CreateTemplateForm,
  type TemplateFormValues,
} from "@/components/tasks/create-template-form";
import type { NamedOption } from "@/components/tasks/delegate-task-control";

export interface TaskTemplateRowView {
  id: string;
  title: string;
  description: string | null;
  frequency: string | null;
  daysOfWeek: number[] | null;
  dayPartId: string | null;
  dayPartName: string | null;
  startTime: string | null;
  dueTime: string | null;
  assignUserId: string | null;
  assignPositionId: string | null;
  assigneeLabel: string | null;
  tokenValue: number;
  active: boolean;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Maps a stored template row to the shape the edit form prefills from. */
function toFormValues(t: TaskTemplateRowView): TemplateFormValues {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? "",
    frequency: t.frequency === "weekly" ? "weekly" : "daily",
    daysOfWeek: t.daysOfWeek ?? [],
    dayPartId: t.dayPartId,
    // Stored times are `HH:MM:SS`; the <input type="time"> wants `HH:MM`.
    startTime: t.startTime ? t.startTime.slice(0, 5) : "",
    dueTime: t.dueTime ? t.dueTime.slice(0, 5) : "",
    assignUserId: t.assignUserId,
    assignPositionId: t.assignPositionId,
    tokenValue: t.tokenValue,
  };
}

export function TaskTemplatesTable({
  templates,
  users,
  positions,
  dayParts,
}: {
  templates: TaskTemplateRowView[];
  users: NamedOption[];
  positions: NamedOption[];
  dayParts: NamedOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Schedule</TableHead>
          <TableHead>Day-part</TableHead>
          <TableHead>Assigned</TableHead>
          <TableHead>Tokens</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {templates.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="font-medium">{t.title}</TableCell>
            <TableCell className="text-muted-foreground">
              {t.frequency === "weekly"
                ? (t.daysOfWeek ?? []).map((d) => DAY_LABELS[d]).join(", ") || "Weekly"
                : "Daily"}
            </TableCell>
            <TableCell className="text-muted-foreground">{t.dayPartName ?? "Any"}</TableCell>
            <TableCell className="text-muted-foreground">{t.assigneeLabel ?? "Pool"}</TableCell>
            <TableCell>{t.tokenValue}</TableCell>
            <TableCell>
              <Badge variant={t.active ? "success" : "outline"}>
                {t.active ? "Active" : "Paused"}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex gap-2">
                <Dialog
                  open={editingId === t.id}
                  onOpenChange={(open) => setEditingId(open ? t.id : null)}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Edit template</DialogTitle>
                    </DialogHeader>
                    <CreateTemplateForm
                      users={users}
                      positions={positions}
                      dayParts={dayParts}
                      initial={toFormValues(t)}
                      onSuccess={() => setEditingId(null)}
                    />
                  </DialogContent>
                </Dialog>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      await setTaskTemplateActive({ id: t.id, active: !t.active });
                      router.refresh();
                    });
                  }}
                >
                  {t.active ? "Pause" : "Resume"}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {templates.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground">
              No recurring templates yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
