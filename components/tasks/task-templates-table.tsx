"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Repeat } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ListRow, StatusBadge } from "@/components/mobile";
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

function scheduleLabel(t: TaskTemplateRowView): string {
  const cadence =
    t.frequency === "weekly"
      ? (t.daysOfWeek ?? []).map((d) => DAY_LABELS[d]).join(", ") || "Weekly"
      : "Daily";
  return `${cadence} · ${t.dayPartName ?? "Any"} · ${t.assigneeLabel ?? "Pool"} · ${t.tokenValue} tokens`;
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

  if (templates.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-[13px] text-muted-ink">
        No recurring templates yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {templates.map((t, i) => (
        <div key={t.id} className={cn("flex flex-col gap-2", i > 0 && "border-t border-line")}>
          <ListRow
            icon={Repeat}
            iconTone={t.active ? "accent" : "neutral"}
            title={t.title}
            description={scheduleLabel(t)}
            trailing={
              <StatusBadge tone={t.active ? "success" : "neutral"} dot>
                {t.active ? "Active" : "Paused"}
              </StatusBadge>
            }
          />
          <div className="flex items-center gap-2 px-4 pb-3">
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
        </div>
      ))}
    </div>
  );
}
