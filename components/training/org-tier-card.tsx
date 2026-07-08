"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionCard, StatusBadge } from "@/components/mobile";
import { assignSlot, createSlot, deleteSlot, deleteTier } from "@/app/(app)/people/org-chart/actions";

const UNSET = "unset";
const VACATE = "vacate";

export interface OrgSlotData {
  id: string;
  userId: string | null;
  userName: string | null;
  label: string | null;
}

export function OrgTierCard({
  tierId,
  name,
  goalCount,
  slots,
  people,
  canManage,
}: {
  tierId: string;
  name: string;
  goalCount: number;
  slots: OrgSlotData[];
  people: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filledCount = slots.filter((s) => s.userId !== null).length;
  const vacancy = Math.max(goalCount - filledCount, 0);

  return (
    <SectionCard
      title={name}
      action={
        <div className="flex items-center gap-2">
          <StatusBadge tone={vacancy > 0 ? "warning" : "success"}>
            {filledCount}/{goalCount} filled
          </StatusBadge>
          {canManage && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                startTransition(async () => {
                  await deleteTier({ id: tierId });
                  router.refresh();
                })
              }
            >
              Delete tier
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        {error && <p className="text-[13px] text-danger">{error}</p>}
        <ul className="flex flex-col gap-2">
          {slots.map((slot) => (
            <li
              key={slot.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-line p-2 text-[15px]"
            >
              <span className={slot.userId ? "text-ink" : "italic text-muted-ink"}>
                {slot.userId ? slot.userName : slot.label || "Vacant"}
              </span>
              {canManage && (
                <div className="flex items-center gap-2">
                  <Select
                    value={slot.userId ?? UNSET}
                    onValueChange={(v) =>
                      startTransition(async () => {
                        const result = await assignSlot({
                          slotId: slot.id,
                          userId: v === VACATE || v === UNSET ? null : v,
                        });
                        if (!result.ok) setError(result.error);
                        router.refresh();
                      })
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Assign..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={VACATE}>Vacant</SelectItem>
                      {people.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        await deleteSlot({ id: slot.id });
                        router.refresh();
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              )}
            </li>
          ))}
          {slots.length === 0 && <li className="text-[13px] text-muted-ink">No slots yet.</li>}
        </ul>
        {canManage && (
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await createSlot({ tierId, sort: slots.length });
                router.refresh();
              })
            }
          >
            Add slot
          </Button>
        )}
      </div>
    </SectionCard>
  );
}
