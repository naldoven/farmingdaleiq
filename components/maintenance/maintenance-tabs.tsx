"use client";

import { useState, type ReactNode } from "react";

import { ChipRow, FilterChip } from "@/components/mobile";

export interface MaintenanceTabDef {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Chip-switched tab body for /maintenance (KitchenIQ mobile pattern: a
 * ChipRow of FilterChips standing in for shadcn's underline Tabs). Purely a
 * client-side view switch; every tab's data was already fetched server-side
 * in app/(app)/maintenance/page.tsx.
 */
export function MaintenanceTabs({
  tabs,
  defaultTab,
}: {
  tabs: MaintenanceTabDef[];
  defaultTab: string;
}) {
  const [active, setActive] = useState(defaultTab);
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <div className="flex flex-col gap-4">
      <ChipRow>
        {tabs.map((tab) => (
          <FilterChip
            key={tab.id}
            active={tab.id === active}
            activeColor="accent"
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </FilterChip>
        ))}
      </ChipRow>
      {current?.content}
    </div>
  );
}
