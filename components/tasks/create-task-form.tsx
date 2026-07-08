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
import { createTask } from "@/app/(app)/tasks/actions";
import type { NamedOption } from "@/components/tasks/delegate-task-control";

const UNSET = "unset";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Ad hoc task creation. Leaves it unassigned (pool) unless a person or
 * position is picked. tasks.manage-gated by the server action. */
export function CreateTaskForm({
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
  const [date, setDate] = useState(todayIso());
  const [dayPartId, setDayPartId] = useState(UNSET);
  const [startTime, setStartTime] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [assignee, setAssignee] = useState(UNSET);
  const [tokenValue, setTokenValue] = useState("0");
  const [notifyDiscord, setNotifyDiscord] = useState(false);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setDone(false);
        const [kind, id] = assignee.split(":");
        startTransition(async () => {
          const result = await createTask({
            title,
            description,
            date,
            dayPartId: dayPartId === UNSET ? "" : dayPartId,
            startTime,
            // due_at is a full timestamp; combine the task's date with the due
            // time. Left empty when no due time is set (task never goes overdue).
            dueAt: dueTime ? `${date}T${dueTime}` : "",
            assignedUserId: kind === "user" ? id : "",
            assignedPositionId: kind === "position" ? id : "",
            tokenValue: Number(tokenValue) || 0,
            notifyDiscord,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setDone(true);
          setTitle("");
          setDescription("");
          setStartTime("");
          setDueTime("");
          setAssignee(UNSET);
          setTokenValue("0");
          setNotifyDiscord(false);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-title">Title</Label>
        <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-description">Description</Label>
        <Textarea
          id="task-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-date">Date</Label>
          <Input
            id="task-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-daypart">Day-part</Label>
          <Select value={dayPartId} onValueChange={setDayPartId}>
            <SelectTrigger id="task-daypart">
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
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-start">Start time</Label>
          <Input
            id="task-start"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-due">Due time</Label>
          <Input
            id="task-due"
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-assignee">Assign to</Label>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger id="task-assignee">
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
          <Label htmlFor="task-tokens">Token value</Label>
          <Input
            id="task-tokens"
            type="number"
            min={0}
            value={tokenValue}
            onChange={(e) => setTokenValue(e.target.value)}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={notifyDiscord}
          onCheckedChange={(v) => setNotifyDiscord(v === true)}
        />
        Notify Discord when assigned
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {done && <p className="text-sm text-success">Task created.</p>}

      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create task"}
        </Button>
      </div>
    </form>
  );
}
