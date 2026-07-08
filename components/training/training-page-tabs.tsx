"use client";

/**
 * Section switcher for /training, replacing the old shadcn <Tabs> with the
 * design system's ChipRow/FilterChip toggle (docs/DESIGN-SYSTEM.md) so the
 * page matches the rest of the mobile redesign instead of a parallel style.
 * Each section's content is still rendered server-side by /training's
 * page.tsx and simply passed through as a slot.
 */

import { useState } from "react";
import type { ReactNode } from "react";

import { ChipRow, FilterChip } from "@/components/mobile";

export interface TrainingTabSlot {
  key: string;
  label: string;
  content: ReactNode;
}

export function TrainingPageTabs({ tabs }: { tabs: TrainingTabSlot[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");

  return (
    <div className="flex flex-col gap-4">
      <ChipRow aria-label="Training sections">
        {tabs.map((tab) => (
          <FilterChip
            key={tab.key}
            type="button"
            active={active === tab.key}
            activeColor="accent"
            onClick={() => setActive(tab.key)}
          >
            {tab.label}
          </FilterChip>
        ))}
      </ChipRow>
      {tabs.map((tab) => (
        <div key={tab.key} hidden={active !== tab.key} className="flex flex-col gap-4">
          {tab.content}
        </div>
      ))}
    </div>
  );
}
