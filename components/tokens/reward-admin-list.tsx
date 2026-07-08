"use client";

import { useState } from "react";
import { Coins } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/mobile";
import { RewardAdminForm } from "@/components/tokens/reward-admin-form";

export interface RewardAdminRow {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  tokenCost: number;
  stock: number | null;
  active: boolean;
}

/** rewards.manage list: every reward (active or retired), each editable inline. */
export function RewardAdminList({ rewards }: { rewards: RewardAdminRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (rewards.length === 0) {
    return <p className="text-[15px] text-muted-ink">No rewards yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {rewards.map((reward) =>
        editingId === reward.id ? (
          <div key={reward.id} className="rounded-2xl border border-line bg-card p-4 shadow-card">
            <RewardAdminForm
              initial={{
                id: reward.id,
                name: reward.name,
                description: reward.description ?? "",
                imageUrl: reward.imageUrl ?? "",
                tokenCost: String(reward.tokenCost),
                stock: reward.stock === null ? "" : String(reward.stock),
                active: reward.active,
              }}
              onSaved={() => setEditingId(null)}
            />
            <Button variant="ghost" size="sm" className="mt-2 rounded-full" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div
            key={reward.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card p-3.5 shadow-card"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[15px] font-semibold text-ink">{reward.name}</span>
                <StatusBadge tone={reward.active ? "success" : "neutral"} dot>
                  {reward.active ? "Active" : "Retired"}
                </StatusBadge>
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-ink">
                <Coins className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                {reward.tokenCost} tokens · {reward.stock === null ? "unlimited stock" : `${reward.stock} in stock`}
              </div>
            </div>
            <Button variant="outline" size="sm" className="shrink-0 rounded-full" onClick={() => setEditingId(reward.id)}>
              Edit
            </Button>
          </div>
        )
      )}
    </div>
  );
}
