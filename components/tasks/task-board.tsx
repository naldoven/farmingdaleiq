"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { ChipRow, FilterChip, SectionCard } from "@/components/mobile";
import { CreateTaskForm } from "@/components/tasks/create-task-form";
import { CreateTemplateForm } from "@/components/tasks/create-template-form";
import type { NamedOption } from "@/components/tasks/delegate-task-control";
import { TaskList, type TaskRowView } from "@/components/tasks/task-list";
import { TaskTemplatesTable, type TaskTemplateRowView } from "@/components/tasks/task-templates-table";

type TabId = "mine" | "pool" | "manage";

/**
 * /tasks board (KitchenIQ mobile redesign, docs/DESIGN-SYSTEM.md). The old
 * My tasks / Pool / Manage shadcn Tabs become a FilterChip row; the round
 * accent "+" jumps straight to the Manage tab's create form. AppShell's
 * sub-page header already renders the "Tasks" title + back chevron from the
 * pathname (lib/nav/page-map.ts resolveHeader), so this only owns the
 * content below it.
 */
export function TaskBoard({
  mine,
  pool,
  allToday,
  templates,
  canManage,
  users,
  positions,
  dayParts,
}: {
  mine: TaskRowView[];
  pool: TaskRowView[];
  allToday: TaskRowView[];
  templates: TaskTemplateRowView[];
  canManage: boolean;
  users: NamedOption[];
  positions: NamedOption[];
  dayParts: NamedOption[];
}) {
  const [tab, setTab] = useState<TabId>("mine");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <ChipRow className="flex-1" aria-label="Task views">
          <FilterChip type="button" active={tab === "mine"} activeColor="accent" onClick={() => setTab("mine")}>
            My Tasks ({mine.length})
          </FilterChip>
          <FilterChip type="button" active={tab === "pool"} activeColor="accent" onClick={() => setTab("pool")}>
            Pool ({pool.length})
          </FilterChip>
          {canManage && (
            <FilterChip
              type="button"
              active={tab === "manage"}
              activeColor="accent"
              onClick={() => setTab("manage")}
            >
              Manage
            </FilterChip>
          )}
        </ChipRow>
        {canManage && (
          <button
            type="button"
            aria-label="Create task"
            onClick={() => setTab("manage")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-transform active:scale-95"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {tab === "mine" && (
        <SectionCard title="Today's Tasks" flush>
          <TaskList tasks={mine} mode="mine" canManage={canManage} users={users} positions={positions} />
        </SectionCard>
      )}

      {tab === "pool" && (
        <SectionCard title="Shift Pool" flush>
          <TaskList tasks={pool} mode="pool" canManage={canManage} users={users} positions={positions} />
        </SectionCard>
      )}

      {canManage && tab === "manage" && (
        <div className="flex flex-col gap-4">
          <SectionCard title="Create Ad Hoc Task">
            <CreateTaskForm users={users} positions={positions} dayParts={dayParts} />
          </SectionCard>

          <SectionCard title="Create Recurring Template">
            <CreateTemplateForm users={users} positions={positions} dayParts={dayParts} />
          </SectionCard>

          <SectionCard title="Recurring Templates" flush>
            <TaskTemplatesTable
              templates={templates}
              users={users}
              positions={positions}
              dayParts={dayParts}
            />
          </SectionCard>

          <SectionCard title="All Tasks Today" flush>
            <TaskList tasks={allToday} mode="all" canManage={canManage} users={users} positions={positions} />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
