"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSession } from "@/app/(app)/training/schedule/actions";
import { SESSION_TAG_OPTIONS } from "@/app/(app)/training/schedule/validation";

const UNSET = "unset";

export function CreateSessionForm({
  enrollmentId,
  positions,
  trainers,
}: {
  enrollmentId: string;
  positions: { id: string; name: string }[];
  trainers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [positionId, setPositionId] = useState(UNSET);
  const [trainerId, setTrainerId] = useState(UNSET);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [tag, setTag] = useState<string>(SESSION_TAG_OPTIONS[0]);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createSession({
            enrollmentId,
            date,
            positionId: positionId === UNSET ? null : positionId,
            trainerUserId: trainerId === UNSET ? null : trainerId,
            startTime,
            endTime,
            tags: [tag],
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="session-date">Date</Label>
        <Input id="session-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="session-start">Start</Label>
        <Input id="session-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="session-end">End</Label>
        <Input id="session-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Station</Label>
        <Select value={positionId} onValueChange={setPositionId}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Station" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET}>Any</SelectItem>
            {positions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label>Trainer</Label>
        <Select value={trainerId} onValueChange={setTrainerId}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Trainer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET}>Unassigned</SelectItem>
            {trainers.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label>Tag</Label>
        <Select value={tag} onValueChange={setTag}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SESSION_TAG_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" size="sm" disabled={isPending}>
        Add session
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
