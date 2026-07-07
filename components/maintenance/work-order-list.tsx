import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

const STATUS_VARIANT: Record<string, "default" | "outline" | "secondary" | "success" | "destructive"> = {
  open: "outline",
  in_progress: "secondary",
  on_hold: "destructive",
  complete: "success",
  cancelled: "outline",
};

const PRIORITY_VARIANT: Record<string, "default" | "outline" | "secondary" | "success" | "destructive"> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
  urgent: "destructive",
};

/** Work order board/list (ARCHITECTURE.md "Work orders"). */
export function WorkOrderList({ workOrders }: { workOrders: WorkOrderRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Equipment</TableHead>
          <TableHead>Assigned</TableHead>
          <TableHead>Due</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {workOrders.map((wo) => (
          <TableRow key={wo.id}>
            <TableCell className="font-medium">
              <Link href={`/maintenance/${wo.id}`} className="text-primary hover:underline">
                {wo.title}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[wo.status] ?? "outline"}>{wo.status.replace("_", " ")}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant={PRIORITY_VARIANT[wo.priority] ?? "outline"}>{wo.priority}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">{wo.equipment_name ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">
              {wo.assigned_user_name ?? wo.vendor_name ?? "Unassigned"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {wo.due_at ? new Date(wo.due_at).toLocaleString() : "—"}
            </TableCell>
          </TableRow>
        ))}
        {workOrders.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              No work orders.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
