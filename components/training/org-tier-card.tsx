"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{name}</span>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {filledCount}/{goalCount} filled
            </Badge>
            {vacancy > 0 && <Badge variant="outline">{vacancy} vacant</Badge>}
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
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <ul className="flex flex-col gap-2">
          {slots.map((slot) => (
            <li key={slot.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <span className={slot.userId ? "" : "text-muted-foreground italic"}>
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
          {slots.length === 0 && <li className="text-sm text-muted-foreground">No slots yet.</li>}
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
      </CardContent>
    </Card>
  );
}
