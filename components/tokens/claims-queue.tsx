"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gift } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/mobile";
import { cancelClaim, fulfillClaim } from "@/app/(app)/rewards/actions";

export interface ClaimQueueRow {
  id: string;
  rewardName: string;
  userName: string;
  cost: number;
  status: string;
  claimedAt: string;
}

/**
 * Fulfillment queue for leaders (rewards.fulfill): every pending claim, with
 * "Mark delivered" and "Cancel & refund". Both actions are idempotent on
 * the server (fulfillClaim only touches status='pending' rows;
 * cancel_reward_claim() rejects a non-pending claim), so a double-click
 * here can't double-deliver or double-refund. Styled as a KitchenIQ list
 * card: icon chip + person/reward + status badge, actions below.
 */
export function ClaimsQueue({ claims }: { claims: ClaimQueueRow[] }) {
  const router = useRouter();

  if (claims.length === 0) {
    return <p className="p-4 text-[15px] text-muted-ink">No pending claims.</p>;
  }

  return (
    <div className="divide-y divide-line">
      {claims.map((claim) => (
        <ClaimRow key={claim.id} claim={claim} onChanged={() => router.refresh()} />
      ))}
    </div>
  );
}

function ClaimRow({ claim, onChanged }: { claim: ClaimQueueRow; onChanged: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
          <Gift className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{claim.userName}</p>
          <p className="truncate text-[13px] text-muted-ink">
            {claim.rewardName} · {claim.cost} tokens · {new Date(claim.claimedAt).toLocaleString()}
          </p>
        </div>
        <StatusBadge tone="warning" dot className="shrink-0">
          {claim.status}
        </StatusBadge>
      </div>

      <div className="ml-[52px] flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="rounded-full"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await fulfillClaim({ claimId: claim.id });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onChanged();
            });
          }}
        >
          Mark delivered
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await cancelClaim({ claimId: claim.id });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onChanged();
            });
          }}
        >
          Cancel &amp; refund
        </Button>
      </div>
      {error && <p className="ml-[52px] text-[13px] text-danger">{error}</p>}
    </div>
  );
}
