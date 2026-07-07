import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClaimsQueue, type ClaimQueueRow } from "@/components/tokens/claims-queue";
import { RewardAdminForm } from "@/components/tokens/reward-admin-form";
import { RewardAdminList, type RewardAdminRow } from "@/components/tokens/reward-admin-list";
import { RewardCard, type RewardCardData } from "@/components/tokens/reward-card";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/tokens/ledger";

/**
 * /rewards: store + claims; admin manages rewards (ARCHITECTURE.md page
 * map). rewards.claim is a base permission granted to every seeded role, so
 * the store grid is visible to everyone signed in; rewards.manage/
 * rewards.fulfill unlock the admin sections below it.
 */
export default async function RewardsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [balance, canClaim, canManage, canFulfill] = await Promise.all([
    getBalance(user.id, supabase),
    hasPermission("rewards.claim"),
    hasPermission("rewards.manage"),
    hasPermission("rewards.fulfill"),
  ]);

  const [{ data: rewards }, { data: myClaims }] = await Promise.all([
    supabase
      .from("rewards")
      .select("id, name, description, image_url, token_cost, stock, active")
      .order("token_cost"),
    supabase
      .from("reward_claims")
      .select("id, reward_id, cost, status, claimed_at")
      .eq("user_id", user.id)
      .order("claimed_at", { ascending: false })
      .limit(10),
  ]);

  const rewardNameById = new Map((rewards ?? []).map((r) => [r.id, r.name]));

  let pendingQueue: ClaimQueueRow[] = [];
  if (canManage || canFulfill) {
    const { data: pending } = await supabase
      .from("reward_claims")
      .select("id, reward_id, user_id, cost, status, claimed_at")
      .eq("status", "pending")
      .order("claimed_at");

    const userIds = Array.from(new Set((pending ?? []).map((c) => c.user_id)));
    const { data: claimants } = userIds.length
      ? await supabase.from("profiles").select("id, name").in("id", userIds)
      : { data: [] as { id: string; name: string }[] };
    const nameById = new Map((claimants ?? []).map((p) => [p.id, p.name]));

    pendingQueue = (pending ?? []).map((c) => ({
      id: c.id,
      rewardName: rewardNameById.get(c.reward_id) ?? "—",
      userName: nameById.get(c.user_id) ?? "—",
      cost: c.cost,
      status: c.status,
      claimedAt: c.claimed_at,
    }));
  }

  const storeRewards: RewardCardData[] = (rewards ?? [])
    .filter((r) => canManage || r.active)
    .map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      tokenCost: r.token_cost,
      stock: r.stock,
      active: r.active,
    }));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Rewards</h1>
          <p className="text-sm text-muted-foreground">Redeem tokens for real rewards.</p>
        </div>
        <Badge variant="secondary">{balance} tokens</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {storeRewards.map((reward) => (
          <RewardCard key={reward.id} reward={reward} balance={balance} canClaimAtAll={canClaim} />
        ))}
        {storeRewards.length === 0 && (
          <p className="text-sm text-muted-foreground">No rewards are set up yet.</p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My claims</CardTitle>
          <CardDescription>Your most recent reward claims.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(myClaims ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">You haven&apos;t claimed anything yet.</p>
          )}
          {(myClaims ?? []).map((claim) => (
            <div key={claim.id} className="flex items-center justify-between text-sm">
              <span>{rewardNameById.get(claim.reward_id) ?? "—"}</span>
              <span className="text-muted-foreground">
                {claim.cost} tokens · <Badge variant="outline">{claim.status}</Badge>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {(canManage || canFulfill) && (
        <Card>
          <CardHeader>
            <CardTitle>Fulfillment queue</CardTitle>
            <CardDescription>Pending claims across the team.</CardDescription>
          </CardHeader>
          <CardContent>
            <ClaimsQueue claims={pendingQueue} />
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Manage rewards</CardTitle>
            <CardDescription>Add a reward or edit an existing one.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <RewardAdminForm />
            <RewardAdminList
              rewards={(rewards ?? []).map(
                (r): RewardAdminRow => ({
                  id: r.id,
                  name: r.name,
                  description: r.description,
                  imageUrl: r.image_url,
                  tokenCost: r.token_cost,
                  stock: r.stock,
                  active: r.active,
                })
              )}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
