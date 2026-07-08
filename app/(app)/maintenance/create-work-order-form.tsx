"use client";

/**
 * Direct work-order creation control for triage holders (ARCHITECTURE.md
 * "Work orders": a leader can also open a work order without a triage
 * request, e.g. spotting something themselves). `createWorkOrder` in
 * actions.ts already existed but had no caller anywhere in the UI; this is
 * that caller. Kept as a small colocated route file (not under
 * components/maintenance) since it only wraps this stream's own action.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { createWorkOrder } from "@/app/(app)/maintenance/actions";

export interface CreateWorkOrderFormOption {
  id: string;
  name: string;
}

const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"] as const;
const NONE_VALUE = "none";

export function CreateWorkOrderForm({
  equipmentOptions,
  assigneeOptions,
  vendorOptions,
}: {
  equipmentOptions: CreateWorkOrderFormOption[];
  assigneeOptions: CreateWorkOrderFormOption[];
  vendorOptions: CreateWorkOrderFormOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [equipmentId, setEquipmentId] = useState(NONE_VALUE);
  const [priority, setPriority] = useState<string>("medium");
  const [assignedUserId, setAssignedUserId] = useState(NONE_VALUE);
  const [vendorId, setVendorId] = useState(NONE_VALUE);
  const [dueAt, setDueAt] = useState("");

  function reset() {
    setTitle("");
    setDescription("");
    setEquipmentId(NONE_VALUE);
    setPriority("medium");
    setAssignedUserId(NONE_VALUE);
    setVendorId(NONE_VALUE);
    setDueAt("");
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        aria-label="New work order"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-transform active:scale-95"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New work order</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wo-title">Title</Label>
                <Input id="wo-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wo-description">Details</Label>
                <Textarea
                  id="wo-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Equipment (optional)</Label>
                <Select value={equipmentId} onValueChange={setEquipmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>None</SelectItem>
                    {equipmentOptions.map((eq) => (
                      <SelectItem key={eq.id} value={eq.id}>
                        {eq.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Assign to</Label>
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
                <Label>Or assign a vendor</Label>
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
                <Label htmlFor="wo-due-at">Due</Label>
                <Input
                  id="wo-due-at"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button
                type="button"
                disabled={isPending || !title.trim()}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const result = await createWorkOrder({
                      title,
                      description: description || undefined,
                      equipmentId: equipmentId === NONE_VALUE ? undefined : equipmentId,
                      priority: priority as (typeof PRIORITY_OPTIONS)[number],
                      assignedUserId: assignedUserId === NONE_VALUE ? undefined : assignedUserId,
                      vendorId: vendorId === NONE_VALUE ? undefined : vendorId,
                      scheduledFor: undefined,
                      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
                    });
                    if (!result.ok) {
                      setError(result.error);
                      return;
                    }
                    reset();
                    setOpen(false);
                    router.refresh();
                  });
                }}
              >
                {isPending ? "Creating..." : "Create work order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
