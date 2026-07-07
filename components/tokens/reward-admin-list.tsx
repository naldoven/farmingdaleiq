"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    return <p className="text-sm text-muted-foreground">No rewards yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {rewards.map((reward) =>
        editingId === reward.id ? (
          <Card key={reward.id}>
            <CardContent className="pt-4">
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
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div key={reward.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{reward.name}</span>
                <Badge variant={reward.active ? "success" : "outline"}>
                  {reward.active ? "Active" : "Retired"}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {reward.tokenCost} tokens · {reward.stock === null ? "unlimited stock" : `${reward.stock} in stock`}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditingId(reward.id)}>
              Edit
            </Button>
          </div>
        )
      )}
    </div>
  );
}
