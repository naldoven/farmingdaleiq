"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { deleteWasteEntry } from "@/app/(app)/waste/actions";

/**
 * Manager-only correction control for the recent-entries list. Local to
 * components/waste/ rather than reusing another stream's generic delete
 * button (e.g. components/checklists/delete-button.tsx) so this module
 * doesn't reach into a directory it doesn't own.
 */
export function DeleteEntryButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm("Delete this waste entry?")) return;
          setError(null);
          startTransition(async () => {
            const result = await deleteWasteEntry({ id });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {isPending ? "..." : "Delete"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
