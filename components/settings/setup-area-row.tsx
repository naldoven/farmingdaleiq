"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/mobile";
import { markAreaConfirmed, markAreaDefault } from "@/app/(app)/settings/setup/actions";
import { safeAction } from "@/lib/errors/safe-action";
import type { StoreSetupAreaKey, StoreSetupStatus } from "@/lib/store-setup/areas";

export interface SetupAreaRowProps {
  areaKey: StoreSetupAreaKey;
  title: string;
  description: string;
  href: string | null;
  status: StoreSetupStatus;
  /** "Confirmed Oct 25 by Dana", built server-side. */
  confirmedLabel: string | null;
  money: boolean;
}

/**
 * One row on /settings/setup: what the area is, its status, a link to the
 * editor, and the Mark confirmed / Mark still default toggle. Stacks on a
 * phone (title and badge, then text, then the two controls) so nothing
 * truncates at 360px.
 */
export function SetupAreaRow({
  areaKey,
  title,
  description,
  href,
  status,
  confirmedLabel,
  money,
}: SetupAreaRowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const confirmed = status === "confirmed";

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() =>
        confirmed ? markAreaDefault({ areaKey }) : markAreaConfirmed({ areaKey }),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        <StatusBadge tone={confirmed ? "success" : "warning"} dot>
          {confirmed ? "Confirmed" : "Still default"}
        </StatusBadge>
        {money && <StatusBadge tone="neutral">Money</StatusBadge>}
      </div>
      <p className="text-[13px] text-muted-ink">{description}</p>
      {confirmedLabel && <p className="text-[13px] text-muted-ink">{confirmedLabel}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {href ? (
          <Button asChild size="sm" variant="secondary" className="rounded-full">
            <Link href={href}>Open editor</Link>
          </Button>
        ) : (
          <span className="text-[13px] text-muted-ink">No editor yet</span>
        )}
        <Button
          type="button"
          size="sm"
          variant={confirmed ? "outline" : "default"}
          className="rounded-full"
          disabled={isPending}
          onClick={toggle}
        >
          {isPending ? "Saving..." : confirmed ? "Mark still default" : "Mark confirmed"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
