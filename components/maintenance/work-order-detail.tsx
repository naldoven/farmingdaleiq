"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionCard, StatusBadge, type StatusTone } from "@/components/mobile";
import {
  addWorkOrderComment,
  assignWorkOrder,
  completeWorkOrder,
  updateWorkOrderStatus,
} from "@/app/(app)/maintenance/actions";
import { WORK_ORDER_TRANSITIONS_FOR_UI, type WorkOrderStatus } from "@/app/(app)/maintenance/logic";
import type { PersonOption } from "@/components/maintenance/triage-queue";

export interface WorkOrderDetailData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  equipment_id: string | null;
  equipment_name: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  scheduled_for: string | null;
  due_at: string | null;
  completed_at: string | null;
  cost: number | null;
  invoice_url: string | null;
  created_at: string;
}

export interface CommentRow {
  id: string;
  author_name: string | null;
  body: string | null;
  photo_url: string | null;
  created_at: string;
}

const NONE_VALUE = "none";
const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  on_hold: "On hold",
  complete: "Complete",
  cancelled: "Cancelled",
};
const STATUS_TONE: Record<string, StatusTone> = {
  open: "info",
  in_progress: "warning",
  on_hold: "danger",
  complete: "success",
  cancelled: "neutral",
};

function StatusControls({ workOrder }: { workOrder: WorkOrderDetailData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const transitions = WORK_ORDER_TRANSITIONS_FOR_UI[workOrder.status as WorkOrderStatus] ?? [];

  function moveTo(status: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateWorkOrderStatus({
        workOrderId: workOrder.id,
        status: status as "open" | "in_progress" | "on_hold" | "cancelled",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (transitions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {transitions.map((status) => (
          <Button key={status} type="button" size="sm" variant="secondary" disabled={isPending} onClick={() => moveTo(status)}>
            Move to {STATUS_LABEL[status] ?? status}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function CompleteForm({
  workOrder,
  canManageEquipment,
}: {
  workOrder: WorkOrderDetailData;
  canManageEquipment: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cost, setCost] = useState(workOrder.cost != null ? String(workOrder.cost) : "");
  const [invoiceUrl, setInvoiceUrl] = useState(workOrder.invoice_url ?? "");
  const [markEquipmentUp, setMarkEquipmentUp] = useState(true);

  if (workOrder.status === "complete" || workOrder.status === "cancelled") return null;
  // Matches the in_progress -> complete-only transition enforced server-side
  // in updateWorkOrderStatus/completeWorkOrder (app/(app)/maintenance/actions.ts).
  if (workOrder.status !== "in_progress") {
    return (
      <p className="text-sm text-muted-foreground">
        Move this work order to &quot;In progress&quot; before completing it.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await completeWorkOrder({
            workOrderId: workOrder.id,
            cost: cost || undefined,
            invoiceUrl: invoiceUrl || undefined,
            markEquipmentUp: workOrder.equipment_id && canManageEquipment ? markEquipmentUp : false,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wo-cost">Cost</Label>
          <Input id="wo-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wo-invoice">Invoice photo URL</Label>
          <Input id="wo-invoice" value={invoiceUrl} onChange={(e) => setInvoiceUrl(e.target.value)} />
        </div>
      </div>
      {workOrder.equipment_id && canManageEquipment && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={markEquipmentUp} onCheckedChange={(v) => setMarkEquipmentUp(Boolean(v))} />
          Equipment is back up and operational
        </label>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Completing..." : "Mark complete"}
      </Button>
    </form>
  );
}

function AssignForm({
  workOrder,
  assigneeOptions,
  vendorOptions,
}: {
  workOrder: WorkOrderDetailData;
  assigneeOptions: PersonOption[];
  vendorOptions: PersonOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [assignedUserId, setAssignedUserId] = useState(workOrder.assigned_user_id ?? NONE_VALUE);
  const [vendorId, setVendorId] = useState(workOrder.vendor_id ?? NONE_VALUE);
  const [scheduledFor, setScheduledFor] = useState(
    workOrder.scheduled_for ? workOrder.scheduled_for.slice(0, 16) : "",
  );
  const [dueAt, setDueAt] = useState(workOrder.due_at ? workOrder.due_at.slice(0, 16) : "");

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await assignWorkOrder({
            workOrderId: workOrder.id,
            assignedUserId: assignedUserId === NONE_VALUE ? undefined : assignedUserId,
            vendorId: vendorId === NONE_VALUE ? undefined : vendorId,
            scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
            dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Assigned to (in-house)</Label>
          <Select value={assignedUserId} onValueChange={setAssignedUserId}>
            <SelectTrigger>
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>Unassigned</SelectItem>
              {assigneeOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Or vendor</Label>
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger>
              <SelectValue placeholder="No vendor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>No vendor</SelectItem>
              {vendorOptions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="scheduled-for">Scheduled visit</Label>
          <Input
            id="scheduled-for"
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="due-at">Due</Label>
          <Input id="due-at" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" variant="secondary" disabled={isPending}>
        {isPending ? "Saving..." : "Save assignment"}
      </Button>
    </form>
  );
}

function CommentThread({ workOrderId, comments }: { workOrderId: string; comments: CommentRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {comments.map((comment) => (
          <div key={comment.id} className="rounded-md border border-border p-2 text-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{comment.author_name ?? "Someone"}</span>
              <span>{new Date(comment.created_at).toLocaleString()}</span>
            </div>
            {comment.body && <p className="mt-1">{comment.body}</p>}
            {comment.photo_url && (
              <a
                href={comment.photo_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-primary hover:underline"
              >
                Photo
              </a>
            )}
          </div>
        ))}
        {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await addWorkOrderComment({
              workOrderId,
              body: body || undefined,
              photoUrl: photoUrl || undefined,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setBody("");
            setPhotoUrl("");
            router.refresh();
          });
        }}
      >
        <Textarea placeholder="Add a comment" value={body} onChange={(e) => setBody(e.target.value)} />
        <Input placeholder="Photo URL (optional)" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Posting..." : "Post comment"}
        </Button>
      </form>
    </div>
  );
}

/**
 * Full work order detail (ARCHITECTURE.md "Work orders").
 *
 * `canManageEquipment` gates the "equipment is back up" checkbox on
 * completion: equipment_downtime/equipment writes are maintenance.manage-
 * only in RLS (supabase/migrations/<ts>_vendors_maintenance_rls.sql), a
 * narrower tier than the maintenance.triage-or-assignee access that lets
 * someone complete their own work order. Showing the checkbox to someone
 * who can complete the order but can't flip equipment status would silently
 * no-op against RLS, so it's hidden instead of offered and ignored.
 */
export function WorkOrderDetail({
  workOrder,
  comments,
  canAssign,
  canManageEquipment,
  assigneeOptions,
  vendorOptions,
}: {
  workOrder: WorkOrderDetailData;
  comments: CommentRow[];
  canAssign: boolean;
  canManageEquipment: boolean;
  assigneeOptions: PersonOption[];
  vendorOptions: PersonOption[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[22px] font-bold text-ink">{workOrder.title}</h1>
        <StatusBadge tone={STATUS_TONE[workOrder.status] ?? "neutral"} dot={workOrder.status === "complete"}>
          {STATUS_LABEL[workOrder.status] ?? workOrder.status}
        </StatusBadge>
        <StatusBadge tone="accent">{workOrder.priority}</StatusBadge>
      </div>

      {workOrder.description && <p className="text-[15px] text-muted-ink">{workOrder.description}</p>}

      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {workOrder.equipment_name && (
          <div>
            <dt className="text-muted-foreground">Equipment</dt>
            <dd>
              {workOrder.equipment_id ? (
                <Link href={`/maintenance/equipment/${workOrder.equipment_id}`} className="text-primary hover:underline">
                  {workOrder.equipment_name}
                </Link>
              ) : (
                workOrder.equipment_name
              )}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground">Assigned</dt>
          <dd>{workOrder.assigned_user_name ?? workOrder.vendor_name ?? "Unassigned"}</dd>
        </div>
        {workOrder.scheduled_for && (
          <div>
            <dt className="text-muted-foreground">Scheduled visit</dt>
            <dd>{new Date(workOrder.scheduled_for).toLocaleString()}</dd>
          </div>
        )}
        {workOrder.due_at && (
          <div>
            <dt className="text-muted-foreground">Due</dt>
            <dd>{new Date(workOrder.due_at).toLocaleString()}</dd>
          </div>
        )}
        {workOrder.completed_at && (
          <div>
            <dt className="text-muted-foreground">Completed</dt>
            <dd>{new Date(workOrder.completed_at).toLocaleString()}</dd>
          </div>
        )}
        {workOrder.cost != null && (
          <div>
            <dt className="text-muted-foreground">Cost</dt>
            <dd>${workOrder.cost.toFixed(2)}</dd>
          </div>
        )}
        {workOrder.invoice_url && (
          <div>
            <dt className="text-muted-foreground">Invoice</dt>
            <dd>
              <a href={workOrder.invoice_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                View
              </a>
            </dd>
          </div>
        )}
      </dl>

      <SectionCard title="Status">
        <div className="flex flex-col gap-4">
          <StatusControls workOrder={workOrder} />
          <CompleteForm workOrder={workOrder} canManageEquipment={canManageEquipment} />
        </div>
      </SectionCard>

      {canAssign && (
        <SectionCard title="Assignment">
          <AssignForm workOrder={workOrder} assigneeOptions={assigneeOptions} vendorOptions={vendorOptions} />
        </SectionCard>
      )}

      <SectionCard title="Comments & photos">
        <CommentThread workOrderId={workOrder.id} comments={comments} />
      </SectionCard>
    </div>
  );
}
