"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  deleteDisciplinaryActionType,
  deleteInfractionType,
} from "@/app/(app)/accountability/actions";

/** Admin row-delete control for an infraction type. Blocked server-side by the FK if still referenced. */
export function DeleteInfractionTypeButton({ id }: { id: string }) {
  return <DeleteRowButton id={id} action={deleteInfractionType} />;
}

/** Admin row-delete control for a disciplinary ladder rung. Blocked server-side by the FK if still referenced. */
export function DeleteDisciplinaryActionTypeButton({ id }: { id: string }) {
  return <DeleteRowButton id={id} action={deleteDisciplinaryActionType} />;
}

function DeleteRowButton({
  id,
  action,
}: {
  id: string;
  action: (input: { id: string }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={isPending}
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
        {isPending ? "Removing..." : "Remove"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
