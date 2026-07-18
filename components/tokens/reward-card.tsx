"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Coins } from "lucide-react";

import { Button } from "@/components/ui/button";
import { claimReward } from "@/app/(app)/rewards/actions";
import { claimBlockedLabel, whyCantClaim, type RewardForClaim } from "@/app/(app)/rewards/logic";

export interface RewardCardData extends RewardForClaim {
  id: string;
  name: string;
  description: string | null;
}

/**
 * One reward in the store grid (ARCHITECTURE.md "/rewards": "Store +
 * claims"). The claim button's disabled state is advisory (app/(app)/
 * rewards/logic.ts whyCantClaim) -- the real check happens inside
 * redeem_reward() when claimReward() is called, so a stale client (balance
 * changed in another tab) still can't overspend. A white rounded KitchenIQ
 * card: name, token-cost pill, description, stock caption, Claim button.
 */
export function RewardCard({ reward, balance, canClaimAtAll }: { reward: RewardCardData; balance: number; canClaimAtAll: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  const blockedReason = whyCantClaim(reward, balance);
  const disabled = !canClaimAtAll || blockedReason !== null || isPending || claimed;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-3.5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-ink">{reward.name}</p>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[12px] font-bold text-warning">
          <Coins className="h-3.5 w-3.5" aria-hidden="true" />
          {reward.tokenCost}
        </span>
      </div>

      {reward.description && (
        <p className="line-clamp-2 text-[13px] text-muted-ink">{reward.description}</p>
      )}

      <p className="text-[13px] text-muted-ink">
        {reward.stock !== null ? `${reward.stock} left` : "In stock"}
      </p>

      {canClaimAtAll && (
        <Button
          size="sm"
          className="mt-1 w-full rounded-full"
          disabled={disabled}
          onClick={() => {
            setError(null);
            // TOK1: one idempotency key per claim attempt, captured in the
            // closure so a retry of this action call dedupes at redeem_reward()
            // instead of creating a second claim + fulfillment task.
            const requestId = crypto.randomUUID();
            startTransition(async () => {
              const result = await claimReward({ rewardId: reward.id, requestId });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setClaimed(true);
              router.refresh();
            });
          }}
        >
          {isPending ? "Claiming..." : claimed ? "Claimed" : "Claim"}
        </Button>
      )}
      {blockedReason && !claimed && (
        <p className="text-[12px] text-muted-ink">{claimBlockedLabel(blockedReason)}</p>
      )}
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}
