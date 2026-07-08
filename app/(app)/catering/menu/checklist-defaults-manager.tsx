"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
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
  toggleChecklistDefaultActive,
} from "@/app/(app)/catering/actions";
import {
  CHECKLIST_STAGE_LABELS,
  CHECKLIST_STAGES,
  type ChecklistStage,
} from "@/app/(app)/catering/logic";

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
 */
export function ChecklistDefaultsManager({ defaults }: { defaults: ChecklistDefaultRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [stage, setStage] = useState<ChecklistStage>(CHECKLIST_STAGES[0]);
  const [label, setLabel] = useState("");

  return (
    <div className="flex flex-col gap-4">
      {CHECKLIST_STAGES.map((s) => {
        const rows = defaults.filter((d) => d.stage === s);
        return (
          <div key={s} className="flex flex-col gap-1.5">
            <p className="text-[13px] font-semibold text-ink">{CHECKLIST_STAGE_LABELS[s]}</p>
            <div className="flex flex-col gap-1.5">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center gap-2 rounded-xl border border-line px-3 py-2"
                >
                  <span className="flex-1 text-[15px] text-ink">{row.label}</span>
                  <StatusBadge tone={row.active ? "success" : "neutral"}>
                    {row.active ? "Active" : "Inactive"}
                  </StatusBadge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        await toggleChecklistDefaultActive({ id: row.id, active: !row.active });
                        router.refresh();
                      });
                    }}
                  >
                    {row.active ? "Retire" : "Reactivate"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => {
                      startTransition(async () => {
                        await deleteChecklistDefault({ id: row.id });
                        router.refresh();
                      });
                    }}
                  >
                    Delete
                  </Button>
                </div>
              ))}
              {rows.length === 0 && (
                <p className="text-[13px] text-muted-ink">No default items for this stage.</p>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <Select value={stage} onValueChange={(v) => setStage(v as ChecklistStage)}>
          <SelectTrigger className="w-48">
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
          className="flex-1"
        />
        <Button
          type="button"
          disabled={isPending || !label.trim()}
          onClick={() => {
            startTransition(async () => {
              await createChecklistDefault({ stage, label });
              setLabel("");
              router.refresh();
            });
          }}
        >
          Add default
        </Button>
      </div>
    </div>
  );
}
