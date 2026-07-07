"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { resolveRerate } from "@/app/(app)/ratings/actions";

export function ResolveRerateButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await resolveRerate({ id });
          router.refresh();
        })
      }
    >
      {isPending ? "Dismissing..." : "Dismiss"}
    </Button>
  );
}
