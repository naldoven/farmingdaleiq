"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/mobile";
import {
  createChecklistDefault,
  deleteChecklistDefault,
  reorderChecklistDefaults,
  toggleChecklistDefaultActive,
  updateChecklistDefault,
} from "@/app/(app)/catering/actions";
import {
  CHECKLIST_STAGE_LABELS,
  CHECKLIST_STAGES,
  moveIdWithin,
  type ChecklistStage,
} from "@/app/(app)/catering/logic";
import type { ActionResult } from "@/app/(app)/catering/action-types";

export interface ChecklistDefaultRow {
  id: string;
  stage: ChecklistStage;
  label: string;
  active: boolean;
}

/**
 * /catering/menu admin panel for catering_checklist_defaults (parity audit
 * Catering finding: "No admin UI for per-stage checklist default templates"
 * -- the table has had a catering.manage write RLS policy since
 * supabase/migrations/20260707040000_catering_rls.sql, but nothing in the
 * app ever wrote to it, so createOrder's planChecklistMaterialization always
 * had zero active defaults to materialize onto a new order). Colocated here
 * (not under components/catering/) as a client component, following the
 * same "use client" + server-action pattern as the sibling
 * components/catering/menu-item-form.tsx.
 *
 * Each row has one "..." menu: rename, move up/down, retire/reactivate,
 * delete. Rows arrive already ordered by sort, and that order is the order
 * items appear on every new order, so a move applies at once in local state
 * and snaps back to the server order if the save fails.
 */
export function ChecklistDefaultsManager({ defaults }: { defaults: ChecklistDefaultRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [stage, setStage] = useState<ChecklistStage>(CHECKLIST_STAGES[0]);
  const [label, setLabel] = useState("");
  const [localDefaults, setLocalDefaults] = useState(defaults);
  const [errors, setErrors] = useState<Partial<Record<ChecklistStage, string>>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  // Adopt fresh server data (after router.refresh()) as the new baseline.
  // Compared against the previous props during render, not in an effect, the
  // same one-shot sync components/catering/kanban-board.tsx uses.
  const [prevDefaults, setPrevDefaults] = useState(defaults);
  if (defaults !== prevDefaults) {
    setPrevDefaults(defaults);
    setLocalDefaults(defaults);
  }

  function setStageError(s: ChecklistStage, message: string | null) {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[s] = message;
      else delete next[s];
      return next;
    });
  }

  /** Runs one action, shows its error under the stage block, refreshes on success. */
  function run(
    s: ChecklistStage,
    action: () => Promise<ActionResult<unknown>>,
    onDone?: () => void,
  ) {
    setStageError(s, null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setStageError(s, result.error);
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  function startRename(row: ChecklistDefaultRow) {
    setEditingId(row.id);
    setEditLabel(row.label);
  }

  function saveRename(row: ChecklistDefaultRow) {
    if (!editLabel.trim()) return;
    run(
      row.stage,
      () =>
        updateChecklistDefault({
          id: row.id,
          stage: row.stage,
          label: editLabel,
          active: row.active,
        }),
      () => setEditingId(null),
    );
  }

  function move(s: ChecklistStage, id: string, direction: "up" | "down") {
    const stageIds = localDefaults.filter((d) => d.stage === s).map((d) => d.id);
    const orderedIds = moveIdWithin(stageIds, id, direction);
    if (orderedIds.every((value, i) => value === stageIds[i])) return;

    setStageError(s, null);
    const byId = new Map(localDefaults.map((d) => [d.id, d]));
    setLocalDefaults((prev) => [
      ...prev.filter((d) => d.stage !== s),
      ...orderedIds.map((rowId) => byId.get(rowId)!),
    ]);

    startTransition(async () => {
      const result = await reorderChecklistDefaults({ stage: s, orderedIds });
      if (!result.ok) {
        setLocalDefaults(defaults);
        setStageError(s, result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {CHECKLIST_STAGES.map((s) => {
        const rows = localDefaults.filter((d) => d.stage === s);
        return (
          <div key={s} className="flex flex-col gap-1.5">
            <p className="text-[13px] font-semibold text-ink">{CHECKLIST_STAGE_LABELS[s]}</p>
            <div className="flex flex-col gap-1.5">
              {rows.map((row, index) => (
                <div
                  key={row.id}
                  className="flex items-center gap-2 rounded-xl border border-line px-3 py-2"
                >
                  {editingId === row.id ? (
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (!isPending) saveRename(row);
                          } else if (e.key === "Escape") {
                            setEditingId(null);
                          }
                        }}
                        aria-label={`Label for ${row.label}`}
                        autoFocus
                        className="flex-1"
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={isPending || !editLabel.trim()}
                          onClick={() => saveRename(row)}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 break-words text-[15px] text-ink">
                        {row.label}
                      </span>
                      <StatusBadge tone={row.active ? "success" : "neutral"}>
                        {row.active ? "Active" : "Inactive"}
                      </StatusBadge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={isPending}
                            aria-label={`Actions for ${row.label}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => startRename(row)}>
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={index === 0}
                            onSelect={() => move(s, row.id, "up")}
                          >
                            Move up
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={index === rows.length - 1}
                            onSelect={() => move(s, row.id, "down")}
                          >
                            Move down
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              run(s, () =>
                                toggleChecklistDefaultActive({ id: row.id, active: !row.active }),
                              )
                            }
                          >
                            {row.active ? "Retire" : "Reactivate"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => run(s, () => deleteChecklistDefault({ id: row.id }))}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </div>
              ))}
              {rows.length === 0 && (
                <p className="text-[13px] text-muted-ink">No default items for this stage.</p>
              )}
            </div>
            {errors[s] && (
              <p role="alert" className="text-[13px] text-danger">
                {errors[s]}
              </p>
            )}
          </div>
        );
      })}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={stage} onValueChange={(v) => setStage(v as ChecklistStage)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHECKLIST_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {CHECKLIST_STAGE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="New default item label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="sm:flex-1"
        />
        <Button
          type="button"
          disabled={isPending || !label.trim()}
          onClick={() => {
            run(
              stage,
              () => createChecklistDefault({ stage, label }),
              () => setLabel(""),
            );
          }}
        >
          Add default
        </Button>
      </div>
    </div>
  );
}
