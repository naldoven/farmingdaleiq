import { redirect } from "next/navigation";
import { Coins } from "lucide-react";

import { SectionCard, SectionLabel, StatusBadge } from "@/components/mobile";
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
 * rewards.fulfill unlock the admin sections below it. Restyled to the
 * KitchenIQ mobile design system (docs/DESIGN-SYSTEM.md) -- data, actions,
 * and permission checks unchanged.
 */
export const metadata = { title: "Rewards" };

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
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <section className="flex flex-col gap-3">
        <SectionLabel
          action={
            <StatusBadge tone="warning">
              <Coins className="h-3 w-3" aria-hidden="true" />
              {balance} tokens
            </StatusBadge>
          }
        >
          Store
        </SectionLabel>

        {storeRewards.length === 0 ? (
          <SectionCard>
            <p className="text-[15px] text-muted-ink">No rewards are set up yet.</p>
          </SectionCard>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {storeRewards.map((reward) => (
              <RewardCard key={reward.id} reward={reward} balance={balance} canClaimAtAll={canClaim} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionLabel>My claims</SectionLabel>
        <SectionCard flush>
          {(myClaims ?? []).length === 0 ? (
            <p className="p-4 text-[15px] text-muted-ink">You haven&apos;t claimed anything yet.</p>
          ) : (
            <div className="divide-y divide-line">
              {(myClaims ?? []).map((claim) => (
                <div key={claim.id} className="flex items-center justify-between gap-2 px-4 py-3">
                  <span className="truncate text-[15px] font-semibold text-ink">
                    {rewardNameById.get(claim.reward_id) ?? "—"}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-[13px] text-muted-ink">
                    {claim.cost} tokens
                    <StatusBadge tone={claim.status === "delivered" ? "success" : claim.status === "cancelled" ? "danger" : "warning"}>
                      {claim.status}
                    </StatusBadge>
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </section>

      {(canManage || canFulfill) && (
        <section className="flex flex-col gap-3">
          <SectionLabel>Fulfillment queue</SectionLabel>
          <SectionCard flush>
            <ClaimsQueue claims={pendingQueue} />
          </SectionCard>
        </section>
      )}

      {canManage && (
        <section className="flex flex-col gap-3">
          <SectionLabel>Manage rewards</SectionLabel>
          <SectionCard>
            <RewardAdminForm />
          </SectionCard>
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
        </section>
      )}
    </div>
  );
}
