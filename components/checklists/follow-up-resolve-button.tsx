"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { resolveFollowUp } from "@/app/(app)/checklists/actions";

export function FollowUpResolveButton({ followUpId }: { followUpId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await resolveFollowUp({ followUpId });
          if (result.ok) router.refresh();
        });
      }}
    >
      {isPending ? "..." : "Resolve"}
    </Button>
  );
}
