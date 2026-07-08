"use client";

import { useState, useTransition } from "react";

import { assignRun } from "@/app/(app)/checklists/actions";

/**
 * Leader-only inline picker to delegate an unassigned run to a person mid-shift
 * (or clear it back to the pool). Colocated with the /checklists page rather
 * than in components/ so it stays inside the Checklists lane. The server action
 * re-checks the leader permission and RLS, so this control is UI convenience
 * only.
 */
export function AssignRunControl({
  runId,
  assignedUserId,
  members,
}: {
  runId: string;
  assignedUserId: string | null;
  members: { id: string; name: string }[];
}) {
  const [value, setValue] = useState(assignedUserId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await assignRun({ runId, userId: next ? next : null });
      if (!result.ok) {
        setError(result.error);
        setValue(previous);
      }
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-1">
      <select
        aria-label="Assign run"
        className="h-9 flex-1 rounded-lg border border-line bg-card px-2 text-[13px] text-ink disabled:opacity-50"
        value={value}
        disabled={pending}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Unassigned</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
