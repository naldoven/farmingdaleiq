"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import {
  deleteDisciplinaryActionType,
  deleteInfractionType,
} from "@/app/(app)/accountability/actions";

/** Admin row-delete control for an infraction type. Blocked server-side by the FK if still referenced. */
export function DeleteInfractionTypeButton({ id }: { id: string }) {
  return <DeleteRowButton id={id} action={deleteInfractionType} label="infraction type" />;
}

/** Admin row-delete control for a disciplinary ladder rung. Blocked server-side by the FK if still referenced. */
export function DeleteDisciplinaryActionTypeButton({ id }: { id: string }) {
  return (
    <DeleteRowButton id={id} action={deleteDisciplinaryActionType} label="ladder rung" />
  );
}

function DeleteRowButton({
  id,
  action,
  label,
}: {
  id: string;
  action: (input: { id: string }) => Promise<{ ok: boolean; error?: string }>;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        aria-label={`Remove ${label}`}
        disabled={isPending}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-ink transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-30"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await action({ id });
            if (!result.ok) {
              setError(result.error ?? "Could not delete.");
              return;
            }
            router.refresh();
          });
        }}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}
