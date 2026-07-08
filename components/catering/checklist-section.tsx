"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SectionCard, StatusBadge } from "@/components/mobile";
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
 * One per-stage checklist: check off items, add/remove items
 * (ARCHITECTURE.md: "items can be added or removed per order"). Used two
 * ways: as its own card ("card", the order detail page's checklist grid) or
 * inline inside a card the caller already renders ("bare", each stage-queue
 * order card, which frames guest info + checklist together).
 */
export function ChecklistSection({
  orderId,
  stage,
  items,
  variant = "card",
}: {
  orderId: string;
  stage: ChecklistStage;
  items: ChecklistItemData[];
  variant?: "card" | "bare";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newLabel, setNewLabel] = useState("");

  const doneCount = items.filter((i) => i.done).length;
  const allDone = items.length > 0 && doneCount === items.length;

  const body = (
    <div className="flex flex-col gap-2">
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
          <span
            className={
              item.done
                ? "flex-1 text-[15px] text-muted-ink line-through"
                : "flex-1 text-[15px] text-ink"
            }
          >
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
      {items.length === 0 && <p className="text-[13px] text-muted-ink">No items yet.</p>}
      <div className="flex items-center gap-2 pt-1">
        <Input
          placeholder="Add item"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="h-9 text-[15px]"
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
    </div>
  );

  const badge = (
    <StatusBadge tone={allDone ? "success" : "neutral"}>
      {doneCount}/{items.length}
    </StatusBadge>
  );

  if (variant === "bare") {
    return (
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-semibold text-ink">{CHECKLIST_STAGE_LABELS[stage]}</h4>
          {badge}
        </div>
        {body}
      </div>
    );
  }

  return (
    <SectionCard title={CHECKLIST_STAGE_LABELS[stage]} action={badge}>
      {body}
    </SectionCard>
  );
}
