"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveFollowUp } from "@/app/(app)/catering/actions";

/** Marks a re-book follow-up call as done, with an optional outcome note. */
export function FollowUpResolveForm({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState("");

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Outcome (optional)"
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        className="h-8 w-48 text-sm"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            await resolveFollowUp({ id, outcome });
            router.refresh();
          });
        }}
      >
        {isPending ? "Saving..." : "Mark done"}
      </Button>
    </div>
  );
}
