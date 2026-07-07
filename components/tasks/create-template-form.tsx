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
import { createTaskTemplate } from "@/app/(app)/tasks/actions";
import type { NamedOption } from "@/components/tasks/delegate-task-control";

const UNSET = "unset";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Recurring task template. Materialized into real tasks by the nightly
 * sync job (app/api/tasks/sync -> materializeTasksForDate). tasks.manage
 * gated by the server action. */
export function CreateTemplateForm({
  users,
  positions,
  dayParts,
}: {
  users: NamedOption[];
  positions: NamedOption[];
  dayParts: NamedOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly">("daily");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [dayPartId, setDayPartId] = useState(UNSET);
  const [dueTime, setDueTime] = useState("");
  const [assignee, setAssignee] = useState(UNSET);
  const [tokenValue, setTokenValue] = useState("0");

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
        startTransition(async () => {
          const result = await createTaskTemplate({
            title,
            description,
            frequency,
            daysOfWeek: frequency === "weekly" ? daysOfWeek : undefined,
            dayPartId: dayPartId === UNSET ? "" : dayPartId,
            dueTime,
            assignUserId: kind === "user" ? id : "",
            assignPositionId: kind === "position" ? id : "",
            tokenValue: Number(tokenValue) || 0,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setDone(true);
          setTitle("");
          setDescription("");
          setDaysOfWeek([]);
          setAssignee(UNSET);
          setTokenValue("0");
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tpl-title">Title</Label>
        <Input id="tpl-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tpl-description">Description</Label>
        <Textarea
          id="tpl-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tpl-frequency">Frequency</Label>
        <Select value={frequency} onValueChange={(v) => setFrequency(v as "daily" | "weekly")}>
          <SelectTrigger id="tpl-frequency" className="w-40">
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
          <Label htmlFor="tpl-daypart">Day-part</Label>
          <Select value={dayPartId} onValueChange={setDayPartId}>
            <SelectTrigger id="tpl-daypart">
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
          <Label htmlFor="tpl-due">Due time</Label>
          <Input
            id="tpl-due"
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tpl-assignee">Assign to</Label>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger id="tpl-assignee">
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tpl-tokens">Token value</Label>
          <Input
            id="tpl-tokens"
            type="number"
            min={0}
            value={tokenValue}
            onChange={(e) => setTokenValue(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {done && <p className="text-sm text-success">Template created.</p>}

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create template"}
        </Button>
      </div>
    </form>
  );
}
