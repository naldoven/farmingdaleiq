"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setOverseerOff } from "@/app/(app)/guest-recovery/settings-actions";
import { SectionCard } from "@/components/mobile";

/**
 * Shows who the Spotlight overseer is. The overseer (or a manager) can mark
 * themselves off, which sends new Spotlight rewards to the backup. The server
 * decides who is allowed; canToggle only decides whether to show the button.
 */
export function OverseerToggle({
  overseerName,
  off,
  canToggle,
}: {
  overseerName: string | null;
  off: boolean;
  canToggle: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setOverseerOff({ off: !off });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <SectionCard>
      <div className="space-y-2">
        <p className="text-base font-semibold text-ink">
          Spotlight overseer: {overseerName ?? "Not set"}
        </p>
        {off && !canToggle && (
          <p className="text-sm text-muted-ink">Overseer is off. Spotlight rewards go to the backup.</p>
        )}
        {canToggle && (
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            className="min-h-11 w-full rounded-lg border border-border px-4 text-base font-semibold text-ink disabled:opacity-50"
          >
            {off ? "I am back" : "I am off today"}
          </button>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
