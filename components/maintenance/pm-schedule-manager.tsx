"use client";

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
import { ListRow, SectionCard, StatusBadge } from "@/components/mobile";
import {
  createPmSchedule,
  setPmScheduleActive,
  updatePmSchedule,
} from "@/app/(app)/maintenance/equipment/actions";
import type { PersonOption } from "@/components/maintenance/triage-queue";

export interface PmScheduleRow {
  id: string;
  title: string;
  description: string | null;
  interval_days: number;
  lead_days: number;
  next_due_on: string | null;
  checklist_template_id: string | null;
  assign_user_id: string | null;
  vendor_id: string | null;
  priority: string | null;
  active: boolean;
}

const NONE_VALUE = "none";
const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"] as const;

interface FormState {
  title: string;
  description: string;
  intervalDays: string;
  leadDays: string;
  nextDueOn: string;
  checklistTemplateId: string;
  assignUserId: string;
  vendorId: string;
  priority: string;
  active: boolean;
}

function emptyForm(): FormState {
  return {
    title: "",
    description: "",
    intervalDays: "90",
    leadDays: "7",
    nextDueOn: "",
    checklistTemplateId: "",
    assignUserId: NONE_VALUE,
    vendorId: NONE_VALUE,
    priority: NONE_VALUE,
    active: true,
  };
}

function formFromRow(row: PmScheduleRow): FormState {
  return {
    title: row.title,
    description: row.description ?? "",
    intervalDays: String(row.interval_days),
    leadDays: String(row.lead_days),
    nextDueOn: row.next_due_on ?? "",
    checklistTemplateId: row.checklist_template_id ?? "",
    assignUserId: row.assign_user_id ?? NONE_VALUE,
    vendorId: row.vendor_id ?? NONE_VALUE,
    priority: row.priority ?? NONE_VALUE,
    active: row.active,
  };
}

function ScheduleFormFields({ form, onChange, assigneeOptions, vendorOptions }: {
  form: FormState;
  onChange: (next: FormState) => void;
  assigneeOptions: PersonOption[];
  vendorOptions: PersonOption[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="pm-title">Title</Label>
        <Input id="pm-title" value={form.title} onChange={(e) => onChange({ ...form, title: e.target.value })} required />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="pm-description">Description / procedure</Label>
        <Textarea
          id="pm-description"
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pm-interval">Repeats every (days)</Label>
        <Input
          id="pm-interval"
          inputMode="numeric"
          value={form.intervalDays}
          onChange={(e) => onChange({ ...form, intervalDays: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pm-lead">Generate work order N days early</Label>
        <Input
          id="pm-lead"
          inputMode="numeric"
          value={form.leadDays}
          onChange={(e) => onChange({ ...form, leadDays: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pm-next-due">Next due on</Label>
        <Input
          id="pm-next-due"
          type="date"
          value={form.nextDueOn}
          onChange={(e) => onChange({ ...form, nextDueOn: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Priority</Label>
        <Select value={form.priority} onValueChange={(v) => onChange({ ...form, priority: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Medium" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>Default (medium)</SelectItem>
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
        <Select value={form.assignUserId} onValueChange={(v) => onChange({ ...form, assignUserId: v })}>
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
        <Select value={form.vendorId} onValueChange={(v) => onChange({ ...form, vendorId: v })}>
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
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor="pm-checklist">Checklist template ID (optional)</Label>
        <Input
          id="pm-checklist"
          placeholder="uuid — attach a procedure checklist"
          value={form.checklistTemplateId}
          onChange={(e) => onChange({ ...form, checklistTemplateId: e.target.value })}
        />
      </div>
    </div>
  );
}

/** Preventive maintenance schedules for one piece of equipment. */
export function PmScheduleManager({
  equipmentId,
  schedules,
  assigneeOptions,
  vendorOptions,
  canManage,
}: {
  equipmentId: string;
  schedules: PmScheduleRow[];
  assigneeOptions: PersonOption[];
  vendorOptions: PersonOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm());

  function toPayload(equipmentId: string, form: FormState) {
    return {
      equipmentId,
      title: form.title,
      description: form.description || undefined,
      intervalDays: Number(form.intervalDays) || 1,
      leadDays: Number(form.leadDays) || 0,
      nextDueOn: form.nextDueOn || undefined,
      checklistTemplateId: form.checklistTemplateId || undefined,
      assignUserId: form.assignUserId === NONE_VALUE ? undefined : form.assignUserId,
      vendorId: form.vendorId === NONE_VALUE ? undefined : form.vendorId,
      priority: form.priority === NONE_VALUE ? undefined : (form.priority as (typeof PRIORITY_OPTIONS)[number]),
      active: form.active,
    };
  }

  return (
    <div className="flex flex-col gap-3">
      {canManage && (
        <div className="flex justify-end">
          <button
            type="button"
            aria-label="Add PM schedule"
            onClick={() => {
              setCreateForm(emptyForm());
              setCreateOpen(true);
            }}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-transform active:scale-95"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {schedules.length === 0 ? (
        <p className="text-[13px] text-muted-ink">No PM schedules yet.</p>
      ) : (
        <SectionCard flush>
          <div className="divide-y divide-line">
            {schedules.map((schedule) => (
              <ListRow
                key={schedule.id}
                title={schedule.title}
                description={`Every ${schedule.interval_days}d · Next due ${schedule.next_due_on ?? "—"}`}
                trailing={
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={schedule.active ? "success" : "neutral"} dot={schedule.active}>
                      {schedule.active ? "Active" : "Paused"}
                    </StatusBadge>
                    {canManage && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditingId(schedule.id);
                            setEditForm(formFromRow(schedule));
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => {
                            startTransition(async () => {
                              const result = await setPmScheduleActive({ id: schedule.id, active: !schedule.active });
                              if (!result.ok) {
                                setError(result.error);
                                return;
                              }
                              router.refresh();
                            });
                          }}
                        >
                          {schedule.active ? "Pause" : "Resume"}
                        </Button>
                      </>
                    )}
                  </div>
                }
              />
            ))}
          </div>
        </SectionCard>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add PM schedule</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              startTransition(async () => {
                const result = await createPmSchedule(toPayload(equipmentId, createForm));
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setCreateOpen(false);
                router.refresh();
              });
            }}
          >
            <ScheduleFormFields
              form={createForm}
              onChange={setCreateForm}
              assigneeOptions={assigneeOptions}
              vendorOptions={vendorOptions}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Add schedule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editingId !== null} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit PM schedule</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!editingId) return;
              setError(null);
              startTransition(async () => {
                const result = await updatePmSchedule({ id: editingId, ...toPayload(equipmentId, editForm) });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setEditingId(null);
                router.refresh();
              });
            }}
          >
            <ScheduleFormFields
              form={editForm}
              onChange={setEditForm}
              assigneeOptions={assigneeOptions}
              vendorOptions={vendorOptions}
            />
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
