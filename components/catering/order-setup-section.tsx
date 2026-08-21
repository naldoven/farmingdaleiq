"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { removeChecklistItem, toggleChecklistItem } from "@/app/(app)/catering/actions";
import {
  PHYSICAL_SETUP_SECTIONS,
  PHYSICAL_SETUP_SECTION_LABELS,
  type PhysicalSetupSection,
} from "@/app/(app)/catering/logic";
import { SectionCard, StatusBadge } from "@/components/mobile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export interface OrderSetupItemData {
  id: string;
  label: string;
  done: boolean;
  setupSection: string | null;
}

function sectionForItem(item: OrderSetupItemData): PhysicalSetupSection | null {
  if (item.setupSection === "equipment") return "paper_goods";

  return PHYSICAL_SETUP_SECTIONS.includes(item.setupSection as PhysicalSetupSection)
    ? (item.setupSection as PhysicalSetupSection)
    : null;
}

/**
 * The one physical setup list for a catering order. Generated rows carry a
 * section. Non-packing FOH checklist rows are rendered separately instead of
 * being mixed into the day-before packing list.
 */
export function OrderSetupSection({
  items,
  canManage,
  variant = "card",
}: {
  items: OrderSetupItemData[];
  canManage: boolean;
  variant?: "card" | "bare";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const itemsBySection = new Map<PhysicalSetupSection, OrderSetupItemData[]>();
  for (const section of PHYSICAL_SETUP_SECTIONS) itemsBySection.set(section, []);
  for (const item of items) {
    const section = sectionForItem(item);
    if (section) itemsBySection.get(section)?.push(item);
  }

  const doneCount = items.filter((item) => item.done).length;
  const allDone = items.length > 0 && doneCount === items.length;

  const body = (
    <div className="flex flex-col gap-5">
      {PHYSICAL_SETUP_SECTIONS.map((section) => {
        const sectionItems = itemsBySection.get(section) ?? [];
        if (sectionItems.length === 0) return null;
        const sectionDone = sectionItems.filter((item) => item.done).length;
        return (
          <div key={section} className="flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-line pb-1">
              <h4 className="text-[15px] font-semibold text-ink">
                {PHYSICAL_SETUP_SECTION_LABELS[section]}
              </h4>
              <span className="text-[13px] text-muted-ink">
                {sectionDone}/{sectionItems.length}
              </span>
            </div>
            {sectionItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <Checkbox
                  checked={item.done}
                  disabled={!canManage || isPending}
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
                {canManage && (
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
                )}
              </div>
            ))}
          </div>
        );
      })}

      {items.length === 0 && <p className="text-[13px] text-muted-ink">Setup will appear the day before the event.</p>}
    </div>
  );

  const badge = (
    <StatusBadge tone={allDone ? "success" : "neutral"}>
      {doneCount}/{items.length}
    </StatusBadge>
  );

  if (variant === "bare") {
    return (
      <div className="border-t border-line pt-3">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-[15px] font-semibold text-ink">Physical order setup</h4>
          {badge}
        </div>
        {body}
      </div>
    );
  }

  return <SectionCard title="Physical order setup" action={badge}>{body}</SectionCard>;
}
