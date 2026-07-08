"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTaskTemplate, updateTaskTemplate } from "@/app/(app)/tasks/actions";
import type { NamedOption } from "@/components/tasks/delegate-task-control";

const UNSET = "unset";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The editable definition of a recurring template, shared by the create and
 * edit paths. `assignee` is the combined "user:<id>" / "position:<id>" token
 * the form's Select uses. */
export interface TemplateFormValues {
  id: string;
  title: string;
  description: string;
  frequency: "daily" | "weekly";
  daysOfWeek: number[];
  dayPartId: string | null;
  startTime: string;
  dueTime: string;
  assignUserId: string | null;
  assignPositionId: string | null;
  tokenValue: number;
}

function assigneeToken(v: Pick<TemplateFormValues, "assignUserId" | "assignPositionId">): string {
  if (v.assignUserId) return `user:${v.assignUserId}`;
  if (v.assignPositionId) return `position:${v.assignPositionId}`;
  return UNSET;
}

/** Recurring task template. Materialized into real tasks by the nightly
 * sync job (app/api/tasks/sync -> materializeTasksForDate). tasks.manage
 * gated by the server action. Pass `initial` (with its `id`) to edit an
 * existing template; omit it to create a new one. */
export function CreateTemplateForm({
  users,
  positions,
  dayParts,
  initial,
  onSuccess,
}: {
  users: NamedOption[];
  positions: NamedOption[];
  dayParts: NamedOption[];
  initial?: TemplateFormValues;
  onSuccess?: () => void;
}) {
  const isEdit = Boolean(initial);
  const idPrefix = initial ? `tpl-${initial.id}` : "tpl-new";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [frequency, setFrequency] = useState<"daily" | "weekly">(initial?.frequency ?? "daily");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initial?.daysOfWeek ?? []);
  const [dayPartId, setDayPartId] = useState(initial?.dayPartId ?? UNSET);
  const [startTime, setStartTime] = useState(initial?.startTime ?? "");
  const [dueTime, setDueTime] = useState(initial?.dueTime ?? "");
  const [assignee, setAssignee] = useState(initial ? assigneeToken(initial) : UNSET);
  const [tokenValue, setTokenValue] = useState(String(initial?.tokenValue ?? 0));

  function toggleDay(day: number) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setDone(false);
        const [kind, id] = assignee.split(":");
        const fields = {
          title,
          description,
          frequency,
          daysOfWeek: frequency === "weekly" ? daysOfWeek : undefined,
          dayPartId: dayPartId === UNSET ? "" : dayPartId,
          startTime,
          dueTime,
          assignUserId: kind === "user" ? id : "",
          assignPositionId: kind === "position" ? id : "",
          tokenValue: Number(tokenValue) || 0,
        };
        startTransition(async () => {
          const result = initial
            ? await updateTaskTemplate({ id: initial.id, ...fields })
            : await createTaskTemplate(fields);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setDone(true);
          if (!isEdit) {
            setTitle("");
            setDescription("");
            setDaysOfWeek([]);
            setStartTime("");
            setDueTime("");
            setAssignee(UNSET);
            setTokenValue("0");
          }
          router.refresh();
          onSuccess?.();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-title`}>Title</Label>
        <Input
          id={`${idPrefix}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-frequency`}>Frequency</Label>
        <Select value={frequency} onValueChange={(v) => setFrequency(v as "daily" | "weekly")}>
          <SelectTrigger id={`${idPrefix}-frequency`} className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {frequency === "weekly" && (
        <div className="flex flex-col gap-1.5">
          <Label>Days of week</Label>
          <div className="flex flex-wrap gap-3">
            {DAY_LABELS.map((label, day) => (
              <label key={day} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={daysOfWeek.includes(day)}
                  onCheckedChange={() => toggleDay(day)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-daypart`}>Day-part</Label>
          <Select value={dayPartId} onValueChange={setDayPartId}>
            <SelectTrigger id={`${idPrefix}-daypart`}>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>Any</SelectItem>
              {dayParts.map((dp) => (
                <SelectItem key={dp.id} value={dp.id}>
                  {dp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-start`}>Start time</Label>
          <Input
            id={`${idPrefix}-start`}
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-due`}>Due time</Label>
          <Input
            id={`${idPrefix}-due`}
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-tokens`}>Token value</Label>
          <Input
            id={`${idPrefix}-tokens`}
            type="number"
            min={0}
            value={tokenValue}
            onChange={(e) => setTokenValue(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-assignee`}>Assign to</Label>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger id={`${idPrefix}-assignee`}>
            <SelectValue placeholder="Leave in the pool" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET}>Leave in the pool</SelectItem>
            <SelectGroup>
              <SelectLabel>People</SelectLabel>
              {users.map((u) => (
                <SelectItem key={`user-${u.id}`} value={`user:${u.id}`}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Positions</SelectLabel>
              {positions.map((p) => (
                <SelectItem key={`position-${p.id}`} value={`position:${p.id}`}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {done && (
        <p className="text-sm text-success">{isEdit ? "Template saved." : "Template created."}</p>
      )}

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending
            ? isEdit
              ? "Saving..."
              : "Creating..."
            : isEdit
              ? "Save changes"
              : "Create template"}
        </Button>
      </div>
    </form>
  );
}
