"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setTaskTemplateActive } from "@/app/(app)/tasks/actions";

export interface TaskTemplateRowView {
  id: string;
  title: string;
  frequency: string | null;
  daysOfWeek: number[] | null;
  dayPartName: string | null;
  assigneeLabel: string | null;
  tokenValue: number;
  active: boolean;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function TaskTemplatesTable({ templates }: { templates: TaskTemplateRowView[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
