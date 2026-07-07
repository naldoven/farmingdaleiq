"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DeleteButton } from "@/components/checklists/delete-button";
import { SCHEDULE_FREQUENCIES, type ScheduleFrequency } from "@/app/(app)/checklists/logic";
import { createSchedule, deleteSchedule } from "@/app/(app)/checklists/templates/actions";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ScheduleRow {
  id: string;
  frequency: string;
  daysOfWeek: number[] | null;
  dayOfMonth: number | null;
  dayPartId: string | null;
  startTime: string | null;
  dueTime: string | null;
  assignPositionId: string | null;
  assignTeamId: string | null;
  alertOnIncomplete: boolean;
}

function scheduleSummary(schedule: ScheduleRow): string {
  if (schedule.frequency === "weekly") {
    const days = (schedule.daysOfWeek ?? []).map((d) => DAY_LABELS[d]).join("/");
    return `Weekly (${days || "no days set"})`;
  }
  if (schedule.frequency === "monthly") {
    return `Monthly (day ${schedule.dayOfMonth ?? "?"})`;
  }
  if (schedule.frequency === "persistent") {
    return "Persistent (always available)";
  }
  return "Daily";
}

/** Lists a template's schedules and lets a manager add a new one. */
export function ScheduleEditor({
  templateId,
  schedules,
  dayParts,
  positions,
  teams,
}: {
  templateId: string;
  schedules: ScheduleRow[];
  dayParts: { id: string; name: string }[];
  positions: { id: string; name: string }[];
  teams: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [frequency, setFrequency] = useState<ScheduleFrequency>("daily");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [dayPartId, setDayPartId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [assignPositionId, setAssignPositionId] = useState("");
  const [assignTeamId, setAssignTeamId] = useState("");
  const [alertOnIncomplete, setAlertOnIncomplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dayPartName = new Map(dayParts.map((d) => [d.id, d.name]));
  const positionName = new Map(positions.map((p) => [p.id, p.name]));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));

  return (
    <div className="flex flex-col gap-3">
      {schedules.map((schedule) => (
        <div
          key={schedule.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2"
        >
          <div className="text-sm">
            <p className="font-medium">{scheduleSummary(schedule)}</p>
            <p className="text-xs text-muted-foreground">
              {schedule.dayPartId ? dayPartName.get(schedule.dayPartId) ?? "Any day part" : "Any day part"}
              {schedule.dueTime ? ` - due ${schedule.dueTime}` : ""}
              {schedule.assignPositionId
                ? ` - position: ${positionName.get(schedule.assignPositionId) ?? "?"}`
                : ""}
              {schedule.assignTeamId ? ` - team: ${teamName.get(schedule.assignTeamId) ?? "?"}` : ""}
              {schedule.alertOnIncomplete ? " - alerts if incomplete" : ""}
            </p>
          </div>
          <DeleteButton id={schedule.id} extra={{ templateId }} action={deleteSchedule} label="Delete" />
        </div>
      ))}
      {schedules.length === 0 && <p className="text-sm text-muted-foreground">No schedules yet.</p>}

      <form
        className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createSchedule({
              templateId,
              frequency,
              daysOfWeek,
              dayOfMonth: frequency === "monthly" ? Number(dayOfMonth) || undefined : undefined,
              dayPartId,
              startTime,
              dueTime,
              assignPositionId,
              assignTeamId,
              alertOnIncomplete,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setDaysOfWeek([]);
            router.refresh();
          });
        }}
      >
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
            className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
          >
            {SCHEDULE_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select
            aria-label="Day part"
            value={dayPartId}
            onChange={(e) => setDayPartId(e.target.value)}
            className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
          >
            <option value="">Any day part</option>
            {dayParts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        {frequency === "weekly" && (
          <div className="flex flex-wrap gap-3 text-sm">
            {DAY_LABELS.map((label, index) => (
              <Label key={label} className="flex items-center gap-1">
                <Checkbox
                  checked={daysOfWeek.includes(index)}
                  onCheckedChange={(checked) => {
                    setDaysOfWeek((prev) =>
                      checked === true ? [...prev, index] : prev.filter((d) => d !== index),
                    );
                  }}
                />
                {label}
              </Label>
            ))}
          </div>
        )}

        {frequency === "monthly" && (
          <input
            aria-label="Day of month"
            type="number"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
            className="h-10 w-24 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
          />
        )}

        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Start time
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Due time
            <input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Assign to position"
            value={assignPositionId}
            onChange={(e) => setAssignPositionId(e.target.value)}
            className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
          >
            <option value="">No position assignment</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Assign to team"
            value={assignTeamId}
            onChange={(e) => setAssignTeamId(e.target.value)}
            className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
          >
            <option value="">No team assignment</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <Label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={alertOnIncomplete}
            onCheckedChange={(v) => setAlertOnIncomplete(v === true)}
          />
          Alert leaders if incomplete at due time
        </Label>

        <div>
          <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
            {isPending ? "Adding..." : "Add schedule"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </div>
  );
}
