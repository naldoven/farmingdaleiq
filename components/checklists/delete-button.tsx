"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/app/(app)/checklists/action-types";

/**
 * Generic delete/resolve button for the Checklists module: calls a server
 * action that takes `{ id, ... }` and returns an ActionResult, then refreshes
 * the route. Shared by food items, sections, questions, schedules, and
 * follow-ups so each doesn't need its own confirm/pending-state wiring.
 */
export function DeleteButton<Extra extends Record<string, unknown>>({
  id,
  extra,
  action,
  label = "Delete",
  confirmMessage,
}: {
  id: string;
  extra?: Extra;
  action: (input: { id: string } & Extra) => Promise<ActionResult>;
  label?: string;
  confirmMessage?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => {
        if (confirmMessage && !window.confirm(confirmMessage)) return;
        startTransition(async () => {
          const result = await action({ id, ...(extra as Extra) });
          if (result.ok) {
            router.refresh();
          }
        });
      }}
    >
      {isPending ? "..." : label}
    </Button>
  );
}
