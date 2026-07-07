"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { deleteSession } from "@/app/(app)/training/schedule/actions";

export function DeleteSessionButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="ghost"
      className="print:hidden"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await deleteSession({ id });
          router.refresh();
        })
      }
    >
      ×
    </Button>
  );
}
