"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { delegateTask } from "@/app/(app)/tasks/actions";

export interface NamedOption {
  id: string;
  name: string;
}

const UNSET = "unset";

/** Leader control: assign an unassigned task to a person or a position. */
export function DelegateTaskControl({
  taskId,
  users,
  positions,
}: {
  taskId: string;
  users: NamedOption[];
  positions: NamedOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(UNSET);

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Assign to..." />
          </SelectTrigger>
          <SelectContent>
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
        <Button
          size="sm"
          disabled={isPending || value === UNSET}
          onClick={() => {
            setError(null);
            const [kind, id] = value.split(":");
            startTransition(async () => {
              const result = await delegateTask({
                id: taskId,
                assignedUserId: kind === "user" ? id : "",
                assignedPositionId: kind === "position" ? id : "",
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setValue(UNSET);
              router.refresh();
            });
          }}
        >
          {isPending ? "Assigning..." : "Assign"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
