"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
import { ListRow, SectionCard } from "@/components/mobile";
import { approveRequest, declineRequest } from "@/app/(app)/maintenance/actions";

export interface RequestRow {
  id: string;
  title: string;
  description: string | null;
  area: string | null;
  suggested_priority: string | null;
  submitted_at: string;
}

export interface PersonOption {
  id: string;
  name: string;
}

const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"] as const;
const NONE_VALUE = "none";

function ReviewDialog({
  request,
  assigneeOptions,
  vendorOptions,
  onClose,
}: {
  request: RequestRow;
  assigneeOptions: PersonOption[];
  vendorOptions: PersonOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"approve" | "decline">("approve");
  const [priority, setPriority] = useState<string>(request.suggested_priority ?? "medium");
  const [assignedUserId, setAssignedUserId] = useState(NONE_VALUE);
  const [vendorId, setVendorId] = useState(NONE_VALUE);
  const [dueAt, setDueAt] = useState("");
  const [declinedReason, setDeclinedReason] = useState("");

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">
          {request.area && <p>Area: {request.area}</p>}
          {request.description && <p>{request.description}</p>}
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "approve" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("approve")}
          >
            Approve
          </Button>
          <Button
            type="button"
            variant={mode === "decline" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("decline")}
          >
            Decline
          </Button>
        </div>

        {mode === "approve" ? (
          <div className="flex flex-col gap-3">
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
              <Label htmlFor="due-at">Due</Label>
              <Input
                id="due-at"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="decline-reason">Reason</Label>
            <Textarea
              id="decline-reason"
              value={declinedReason}
              onChange={(e) => setDeclinedReason(e.target.value)}
              required
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            type="button"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result =
                  mode === "approve"
                    ? await approveRequest({
                        requestId: request.id,
                        priority: priority as (typeof PRIORITY_OPTIONS)[number],
                        assignedUserId: assignedUserId === NONE_VALUE ? undefined : assignedUserId,
                        vendorId: vendorId === NONE_VALUE ? undefined : vendorId,
                        scheduledFor: undefined,
                        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
                      })
                    : await declineRequest({ requestId: request.id, declinedReason });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                onClose();
                router.refresh();
              });
            }}
          >
            {isPending ? "Saving..." : mode === "approve" ? "Approve & create work order" : "Decline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Leader triage queue (ARCHITECTURE.md "Triage"). */
export function TriageQueue({
  requests,
  assigneeOptions,
  vendorOptions,
}: {
  requests: RequestRow[];
  assigneeOptions: PersonOption[];
  vendorOptions: PersonOption[];
}) {
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const reviewing = requests.find((r) => r.id === reviewingId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      {requests.length === 0 ? (
        <p className="px-1 text-[13px] text-muted-ink">No pending requests.</p>
      ) : (
        <SectionCard flush>
          <div className="divide-y divide-line">
            {requests.map((request) => (
              <ListRow
                key={request.id}
                title={request.title}
                description={[
                  request.area,
                  request.suggested_priority ? `${request.suggested_priority} priority` : null,
                  new Date(request.submitted_at).toLocaleDateString(),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                trailing={
                  <Button type="button" size="sm" onClick={() => setReviewingId(request.id)}>
                    Review
                  </Button>
                }
              />
            ))}
          </div>
        </SectionCard>
      )}

      {reviewing && (
        <ReviewDialog
          request={reviewing}
          assigneeOptions={assigneeOptions}
          vendorOptions={vendorOptions}
          onClose={() => setReviewingId(null)}
        />
      )}
    </div>
  );
}
