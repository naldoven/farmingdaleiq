"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
 * here can't double-deliver or double-refund.
 */
export function ClaimsQueue({ claims }: { claims: ClaimQueueRow[] }) {
  const router = useRouter();

  if (claims.length === 0) {
    return <p className="text-sm text-muted-foreground">No pending claims.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Claimed</TableHead>
          <TableHead>Person</TableHead>
          <TableHead>Reward</TableHead>
          <TableHead>Cost</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-56" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {claims.map((claim) => (
          <ClaimRow key={claim.id} claim={claim} onChanged={() => router.refresh()} />
        ))}
      </TableBody>
    </Table>
  );
}

function ClaimRow({ claim, onChanged }: { claim: ClaimQueueRow; onChanged: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <TableRow>
      <TableCell className="text-muted-foreground">{new Date(claim.claimedAt).toLocaleString()}</TableCell>
      <TableCell>{claim.userName}</TableCell>
      <TableCell>{claim.rewardName}</TableCell>
      <TableCell>{claim.cost}</TableCell>
      <TableCell>
        <Badge variant="outline">{claim.status}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
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
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </TableCell>
    </TableRow>
  );
}
