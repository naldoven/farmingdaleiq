"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createPosition,
  createPositionGroup,
  deletePosition,
  deletePositionGroup,
  seedDefaultPositions,
} from "@/app/(app)/setups/templates/actions";
import { hasSeedPositionGroups } from "@/app/(app)/setups/templates/constants";

export interface PositionGroupRow {
  id: string;
  name: string;
  sort: number;
}

export interface PositionRow {
  id: string;
  group_id: string | null;
  name: string;
  sort: number;
}

const UNGROUPED = "ungrouped";

export function PositionsManager({
  groups,
  positions,
}: {
  groups: PositionGroupRow[];
  positions: PositionRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [groupName, setGroupName] = useState("");
  const [positionName, setPositionName] = useState("");
  const [positionGroupId, setPositionGroupId] = useState<string>(UNGROUPED);

  const positionsByGroup = new Map<string | null, PositionRow[]>();
  for (const position of positions) {
    const key = position.group_id;
    const list = positionsByGroup.get(key) ?? [];
    list.push(position);
    positionsByGroup.set(key, list);
  }

  // HIGH parity-audit fix: the self-heal seed button used to show only when
  // *no* positions existed at all, so it never appeared once the unrelated
  // training-roadmap group (S4's onboarding stations) was seeded. Gate
  // instead on whether any of this seed's own group names are present --
  // that's the real "have setup positions been seeded" question.
  const hasSeedGroups = hasSeedPositionGroups(groups.map((g) => g.name));

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {!hasSeedGroups && (
        <div className="rounded-xl border border-dashed border-line bg-accent-soft/40 p-3 text-[13px] text-muted-ink">
          No setup positions yet.{" "}
          <button
            type="button"
            className="font-semibold text-accent hover:underline disabled:opacity-50"
            disabled={isPending}
            onClick={() => run(() => seedDefaultPositions())}
          >
            Seed the Avondale FOH/BOH default list
          </button>{" "}
          to get started (marked SEED-DEFAULT; edit or delete anything after).
          Safe to click even if other groups (e.g. a training roadmap) already exist.
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const result = await createPositionGroup({ name: groupName });
            if (result.ok) setGroupName("");
            return result;
          });
        }}
      >
        <Input
          aria-label="New group name"
          placeholder="New position group (e.g. Kitchen)"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          className="rounded-full"
          required
        />
        <Button type="submit" disabled={isPending} variant="outline">
          Add group
        </Button>
      </form>

      <form
        className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const result = await createPosition({
              groupId: positionGroupId === UNGROUPED ? null : positionGroupId,
              name: positionName,
            });
            if (result.ok) setPositionName("");
            return result;
          });
        }}
      >
        <Select value={positionGroupId} onValueChange={setPositionGroupId}>
          <SelectTrigger className="w-56 rounded-full">
            <SelectValue placeholder="Group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNGROUPED}>No group</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label="New position name"
          placeholder="New position (e.g. Register 1)"
          value={positionName}
          onChange={(e) => setPositionName(e.target.value)}
          className="rounded-full"
          required
        />
        <Button type="submit" disabled={isPending}>
          Add position
        </Button>
      </form>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.id} className="rounded-2xl border border-line bg-card p-3 shadow-card">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="truncate text-[15px] font-semibold text-ink">{group.name}</h3>
              <button
                type="button"
                aria-label={`Delete ${group.name}`}
                disabled={isPending}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-danger hover:bg-danger-soft disabled:opacity-50"
                onClick={() => run(() => deletePositionGroup({ id: group.id }))}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
              {(positionsByGroup.get(group.id) ?? []).map((position) => (
                <div key={position.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="truncate text-[13px] text-ink">{position.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${position.name}`}
                    disabled={isPending}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-ink hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                    onClick={() => run(() => deletePosition({ id: position.id }))}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
              {(positionsByGroup.get(group.id) ?? []).length === 0 && (
                <p className="px-3 py-2 text-[13px] text-muted-ink">No positions in this group yet.</p>
              )}
            </div>
          </div>
        ))}

        {(positionsByGroup.get(null) ?? []).length > 0 && (
          <div className="rounded-2xl border border-dashed border-line p-3">
            <h3 className="mb-2 text-[15px] font-semibold text-muted-ink">Ungrouped</h3>
            <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
              {(positionsByGroup.get(null) ?? []).map((position) => (
                <div key={position.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="truncate text-[13px] text-ink">{position.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${position.name}`}
                    disabled={isPending}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-ink hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                    onClick={() => run(() => deletePosition({ id: position.id }))}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
