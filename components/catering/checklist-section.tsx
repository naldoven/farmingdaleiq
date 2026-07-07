"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  addChecklistItem,
  removeChecklistItem,
  toggleChecklistItem,
} from "@/app/(app)/catering/actions";
import { CHECKLIST_STAGE_LABELS, type ChecklistStage } from "@/app/(app)/catering/logic";

export interface ChecklistItemData {
  id: string;
  label: string;
  done: boolean;
}

/**
 * One per-stage checklist on the order detail page: check off items,
 * add/remove items (ARCHITECTURE.md: "items can be added or removed per
 * order").
 */
export function ChecklistSection({
  orderId,
  stage,
  items,
}: {
  orderId: string;
  stage: ChecklistStage;
  items: ChecklistItemData[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newLabel, setNewLabel] = useState("");

  const doneCount = items.filter((i) => i.done).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span>{CHECKLIST_STAGE_LABELS[stage]}</span>
          <span className="text-muted-foreground">
            {doneCount}/{items.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            <Checkbox
              checked={item.done}
              disabled={isPending}
              onCheckedChange={(checked) => {
                startTransition(async () => {
                  await toggleChecklistItem({ id: item.id, done: checked === true });
                  router.refresh();
                });
              }}
            />
            <span className={item.done ? "flex-1 text-sm line-through text-muted-foreground" : "flex-1 text-sm"}>
              {item.label}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  await removeChecklistItem({ id: item.id });
                  router.refresh();
                });
              }}
            >
              Remove
            </Button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground">No items yet.</p>
        )}
        <div className="flex items-center gap-2 pt-1">
          <Input
            placeholder="Add item"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="h-8 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending || !newLabel.trim()}
            onClick={() => {
              const label = newLabel.trim();
              setNewLabel("");
              startTransition(async () => {
                await addChecklistItem({ orderId, stage, label });
                router.refresh();
              });
            }}
          >
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
