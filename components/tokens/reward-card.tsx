"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
 * changed in another tab) still can't overspend.
 */
export function RewardCard({ reward, balance, canClaimAtAll }: { reward: RewardCardData; balance: number; canClaimAtAll: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  const blockedReason = whyCantClaim(reward, balance);
  const disabled = !canClaimAtAll || blockedReason !== null || isPending || claimed;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{reward.name}</CardTitle>
          <Badge variant="secondary">{reward.tokenCost} tokens</Badge>
        </div>
        {reward.description && <CardDescription>{reward.description}</CardDescription>}
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {reward.stock !== null ? `${reward.stock} left` : "In stock"}
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-1">
        {canClaimAtAll && (
          <Button
            disabled={disabled}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await claimReward({ rewardId: reward.id });
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
          <p className="text-xs text-muted-foreground">{claimBlockedLabel(blockedReason)}</p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardFooter>
    </Card>
  );
}
