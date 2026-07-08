"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { acknowledgeDisciplinaryAction } from "@/app/(app)/accountability/actions";

/** Acknowledges a pending disciplinary action (self, or a manager on someone's behalf). */
export function AcknowledgeButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        className="inline-flex h-7 shrink-0 items-center rounded-full bg-accent px-3 text-[12px] font-semibold text-white transition-transform active:scale-95 disabled:opacity-60"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await acknowledgeDisciplinaryAction({ id });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {isPending ? "Acknowledging…" : "Acknowledge"}
      </button>
      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}
