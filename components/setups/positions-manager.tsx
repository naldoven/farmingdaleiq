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
import {
  createPosition,
  createPositionGroup,
  deletePosition,
  deletePositionGroup,
  seedDefaultPositions,
} from "@/app/(app)/setups/templates/actions";

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
    <div className="flex flex-col gap-6">
      {groups.length === 0 && positions.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No positions yet.{" "}
          <button
            type="button"
            className="font-medium text-primary hover:underline disabled:opacity-50"
            disabled={isPending}
            onClick={() => run(() => seedDefaultPositions())}
          >
            Seed the Avondale FOH/BOH default list
          </button>{" "}
          to get started (marked SEED-DEFAULT; edit or delete anything after).
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-2"
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
          required
        />
        <Button type="submit" disabled={isPending} variant="outline">
          Add group
        </Button>
      </form>

      <form
        className="flex flex-wrap items-end gap-2"
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
          <SelectTrigger className="w-56">
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
          required
        />
        <Button type="submit" disabled={isPending}>
          Add position
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.id} className="rounded-md border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium">{group.name}</h3>
              <Button
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => run(() => deletePositionGroup({ id: group.id }))}
              >
                Delete group
              </Button>
            </div>
            <ul className="flex flex-col gap-1">
              {(positionsByGroup.get(group.id) ?? []).map((position) => (
                <li key={position.id} className="flex items-center justify-between text-sm">
                  <span>{position.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => run(() => deletePosition({ id: position.id }))}
                  >
                    Remove
                  </Button>
                </li>
              ))}
              {(positionsByGroup.get(group.id) ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">No positions in this group yet.</li>
              )}
            </ul>
          </div>
        ))}

        {(positionsByGroup.get(null) ?? []).length > 0 && (
          <div className="rounded-md border border-dashed border-border p-3">
            <h3 className="mb-2 font-medium text-muted-foreground">Ungrouped</h3>
            <ul className="flex flex-col gap-1">
              {(positionsByGroup.get(null) ?? []).map((position) => (
                <li key={position.id} className="flex items-center justify-between text-sm">
                  <span>{position.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => run(() => deletePosition({ id: position.id }))}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
