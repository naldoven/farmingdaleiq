"use client";

/**
 * The KitchenIQ "Training" progress-list screen (docs/DESIGN-SYSTEM.md
 * "PROGRESS lists"): filter chips (In Progress / Training Plan / Employee) +
 * "N Results" + a list/grid toggle, then one card per enrollment showing the
 * trainee's avatar, name, start date, passport ("plan") badge, and a
 * completed-items progress bar. Purely a client-side view over the
 * enrollment rows /training already computes server-side -- no new queries,
 * actions, or permission checks.
 */

import { useMemo, useState } from "react";
import { LayoutGrid, List } from "lucide-react";

import { AvatarInitials, ChipRow, FilterChip, ProgressBar, SectionCard, StatusBadge } from "@/components/mobile";
import { cn } from "@/lib/utils";

export interface RosterRow {
  enrollmentId: string;
  userName: string;
  passportName: string;
  startedAt: string | null;
  completed: number;
  total: number;
  stamped: boolean;
}

export interface TrainingRosterProps {
  rows: RosterRow[];
}

const ALL = "all";

function formatStarted(iso: string | null): string {
  if (!iso) return "Training started —";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Training started —";
  return `Training started ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

function percentOf(completed: number, total: number): number {
  if (total <= 0) return 0;
  return (completed / total) * 100;
}

/** A pill-styled native <select>, matching FilterChip's look for the
 * "Training Plan" / "Employee" dropdown filters. */
function ChipSelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  const isAll = value === ALL;
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
        isAll ? "border-line bg-card text-muted-ink" : "border-ink bg-ink text-white",
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function TrainingRoster({ rows }: TrainingRosterProps) {
  const [inProgressOnly, setInProgressOnly] = useState(false);
  const [plan, setPlan] = useState(ALL);
  const [employee, setEmployee] = useState(ALL);
  const [view, setView] = useState<"list" | "grid">("list");

  const plans = useMemo(
    () => [...new Set(rows.map((r) => r.passportName))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const employees = useMemo(
    () => [...new Set(rows.map((r) => r.userName))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const filtered = rows.filter((row) => {
    if (inProgressOnly && row.stamped) return false;
    if (plan !== ALL && row.passportName !== plan) return false;
    if (employee !== ALL && row.userName !== employee) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-3">
      <ChipRow aria-label="Training filters">
        <FilterChip
          type="button"
          active={inProgressOnly}
          activeColor="accent"
          onClick={() => setInProgressOnly((v) => !v)}
        >
          In Progress
        </FilterChip>
        <ChipSelect
          ariaLabel="Filter by training plan"
          value={plan}
          onChange={setPlan}
          options={[{ value: ALL, label: "Training Plan" }, ...plans.map((p) => ({ value: p, label: p }))]}
        />
        <ChipSelect
          ariaLabel="Filter by employee"
          value={employee}
          onChange={setEmployee}
          options={[{ value: ALL, label: "Employee" }, ...employees.map((e) => ({ value: e, label: e }))]}
        />
      </ChipRow>

      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-muted-ink">{filtered.length} Results</p>
        <div className="flex items-center gap-1 rounded-full border border-line bg-card p-1">
          <button
            type="button"
            aria-label="List view"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full",
              view === "list" ? "bg-ink text-white" : "text-muted-ink",
            )}
          >
            <List className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full",
              view === "grid" ? "bg-ink text-white" : "text-muted-ink",
            )}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <SectionCard>
          <p className="text-[13px] text-muted-ink">No enrollments match these filters.</p>
        </SectionCard>
      ) : view === "list" ? (
        <SectionCard flush>
          <div className="divide-y divide-line">
            {filtered.map((row) => {
              const pct = percentOf(row.completed, row.total);
              return (
                <div key={row.enrollmentId} className="flex flex-col gap-3 px-4 py-4">
                  <div className="flex items-center gap-3">
                    <AvatarInitials name={row.userName} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-ink">{row.userName}</p>
                      <p className="truncate text-[13px] text-muted-ink">{formatStarted(row.startedAt)}</p>
                    </div>
                    <StatusBadge tone={row.stamped ? "success" : "accent"}>{row.passportName}</StatusBadge>
                  </div>
                  <ProgressBar
                    value={pct}
                    tone={row.stamped ? "success" : "accent"}
                    label={`${row.completed}/${row.total} Completed`}
                    showLabel
                  />
                </div>
              );
            })}
          </div>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((row) => {
            const pct = percentOf(row.completed, row.total);
            return (
              <div key={row.enrollmentId} className="flex flex-col gap-2 rounded-2xl border border-line bg-card p-3 shadow-card">
                <div className="flex items-center gap-2">
                  <AvatarInitials name={row.userName} size="sm" />
                  <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{row.userName}</p>
                </div>
                <StatusBadge tone={row.stamped ? "success" : "accent"} className="self-start">
                  {row.passportName}
                </StatusBadge>
                <ProgressBar
                  value={pct}
                  tone={row.stamped ? "success" : "accent"}
                  label={`${row.completed}/${row.total}`}
                  showLabel
                />
                <p className="truncate text-[13px] text-muted-ink">{formatStarted(row.startedAt)}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
