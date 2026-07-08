"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { bootstrapFirstAdmin } from "@/app/(app)/people/actions";

/**
 * "Claim admin access" button on /people/bootstrap. Calls the
 * `bootstrapFirstAdmin` server action (app/(app)/people/actions.ts), which
 * re-checks eligibility server-side immediately before writing.
 */
export function BootstrapAdminButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [roleName, setRoleName] = useState<string | null>(null);

  if (roleName) {
    return (
      <p className="text-sm text-success">
        You&rsquo;re now {roleName}. Reloading&hellip;
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await bootstrapFirstAdmin();
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setRoleName(result.data.roleName);
            router.push("/people");
            router.refresh();
          });
        }}
      >
        {isPending ? "Claiming..." : "Claim admin access"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
