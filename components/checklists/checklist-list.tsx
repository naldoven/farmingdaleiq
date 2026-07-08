"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";

import { ChipRow, FilterChip, ListRow, SearchBar, SectionCard, StatusBadge } from "@/components/mobile";
import type { ListRowTone } from "@/components/mobile";
import type { StatusTone } from "@/components/mobile";
import { AssignRunControl } from "@/app/(app)/checklists/assign-run-control";

export type RunStatus = "pending" | "in_progress" | "completed" | "missed";

const STATUS_META: Record<RunStatus, { label: string; tone: StatusTone; iconTone: ListRowTone }> = {
  pending: { label: "Pending", tone: "neutral", iconTone: "neutral" },
  in_progress: { label: "In Progress", tone: "warning", iconTone: "warning" },
  completed: { label: "Completed", tone: "success", iconTone: "success" },
  missed: { label: "Missed", tone: "danger", iconTone: "danger" },
};

const STATUS_FILTERS: { value: "all" | RunStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "missed", label: "Missed" },
];

export interface ChecklistRunItem {
  id: string;
  templateName: string;
  dayPartName: string | null;
  status: RunStatus;
  assignedUserId: string | null;
  assignmentLabel: string;
  /** Manager can reassign while the run is still open (not completed/missed). */
  canReassign: boolean;
}

/**
 * /checklists list card: SearchBar + Owner/Status FilterChips + an "All (N)"
 * count, then one white rounded card per run (KitchenIQ mobile list pattern,
 * docs/DESIGN-SYSTEM.md). Purely client-side filtering over the runs the
 * server already fetched -- no new queries, no change to what a role can see.
 */
export function ChecklistList({
  runs,
  currentUserId,
  canManageTemplates,
  members,
}: {
  runs: ChecklistRunItem[];
  currentUserId: string | null;
  canManageTemplates: boolean;
  members: { id: string; name: string }[];
}) {
  const [owner, setOwner] = useState<"all" | "mine">("all");
  const [status, setStatus] = useState<"all" | RunStatus>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return runs.filter((run) => {
      if (owner === "mine" && run.assignedUserId !== currentUserId) return false;
      if (status !== "all" && run.status !== status) return false;
      if (query && !run.templateName.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [runs, owner, status, search, currentUserId]);

  return (
    <div className="flex flex-col gap-3">
      <SearchBar
        label="Search checklists"
        placeholder="Search checklists"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <ChipRow aria-label="Filter by owner">
        <FilterChip type="button" active={owner === "all"} onClick={() => setOwner("all")}>
          All
        </FilterChip>
        <FilterChip type="button" active={owner === "mine"} onClick={() => setOwner("mine")}>
          Mine
        </FilterChip>
      </ChipRow>

      <ChipRow aria-label="Filter by status">
        {STATUS_FILTERS.map((option) => (
          <FilterChip
            key={option.value}
            type="button"
            active={status === option.value}
            onClick={() => setStatus(option.value)}
          >
            {option.label}
          </FilterChip>
        ))}
      </ChipRow>

      <p className="px-1 text-[13px] font-semibold text-muted-ink">
        {owner === "mine" ? "Mine" : "All"} ({filtered.length})
      </p>

      {filtered.length === 0 ? (
        <SectionCard>
          <p className="text-[13px] text-muted-ink">
            {runs.length === 0 ? "No checklists scheduled for today yet." : "No checklists match these filters."}
          </p>
        </SectionCard>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((run) => {
            const meta = STATUS_META[run.status];
            return (
              <SectionCard key={run.id} flush>
                <div className="divide-y divide-line">
                  <ListRow
                    icon={ClipboardCheck}
                    iconTone={meta.iconTone}
                    title={run.templateName}
                    description={
                      run.dayPartName ? `${run.dayPartName} · ${run.assignmentLabel}` : run.assignmentLabel
                    }
                    href={`/checklists/${run.id}`}
                    trailing={<StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>}
                  />
                  {canManageTemplates && run.canReassign && (
                    <div className="flex items-center gap-2 px-4 py-2">
                      <span className="text-[13px] text-muted-ink">Assign</span>
                      <AssignRunControl
                        runId={run.id}
                        assignedUserId={run.assignedUserId}
                        members={members}
                      />
                    </div>
                  )}
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
