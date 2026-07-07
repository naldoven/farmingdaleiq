"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { recordAudit } from "@/app/(app)/training/graduates/actions";

export function RecordAuditButtons({ auditId }: { auditId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await recordAudit({ auditId, result: "pass" });
            router.refresh();
          })
        }
      >
        PASS
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await recordAudit({ auditId, result: "pip" });
            router.refresh();
          })
        }
      >
        PIP
      </Button>
    </div>
  );
}
