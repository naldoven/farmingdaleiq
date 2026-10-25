"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionCard, StatusBadge } from "@/components/mobile";
import {
  createPosition,
  createPositionGroup,
  deletePosition,
  deletePositionGroup,
  renamePositionGroup,
  reorderPositions,
  seedDefaultPositions,
  setPositionRateable,
  updatePosition,
} from "@/app/(app)/settings/positions/actions";
import {
  groupPositions,
  moveInList,
  shouldOfferDefaultList,
} from "@/app/(app)/settings/positions/logic";
import { safeAction } from "@/lib/errors/safe-action";

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
  is_rateable: boolean;
}

const UNGROUPED = "__ungrouped__";

type Result = { ok: true; data: unknown } | { ok: false; error: string };

/**
 * Runs one server action, surfaces its error inline, and refreshes the
 * page on success. Shared by every control in this editor so each one is a
 * single call site. safeAction turns a lost connection into the same error
 * shape (lib/errors/safe-action.ts).
 */
function useRun() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<Result>, onOk?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await safeAction(action);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onOk?.();
      router.refresh();
    });
  }

  return { run, isPending, error };
}

/** What a position delete removes, for the confirm prompt. Keep in step with delete_position (20260718010300). */
function positionDeleteConfirm(name: string): string {
  return `Delete "${name}"? This permanently removes the position, its training passport and the passport's items, its rating rubric, any open re-rate reminders, and its setup assignments, setup template slots, and layout tiles. It cannot be undone.\n\nIf anyone has a rating here or has started its passport, nothing is deleted and you will be told why.`;
}

/** What a group delete removes, for the confirm prompt. Keep in step with delete_position_group (20260718010300). */
function groupDeleteConfirm(name: string, positionCount: number): string {
  const members = `${positionCount} position${positionCount === 1 ? "" : "s"}`;
  return `Delete the group "${name}" and its ${members}? This permanently removes the group and every position in it, including each position's training passport and its items, rating rubric, open re-rate reminders, setup assignments, setup template slots, and layout tiles. It cannot be undone.\n\nIf any position in the group has a rating or a started passport, nothing is deleted and you will be told why.`;
}

function PositionItem({
  position,
  groups,
  isTrainingStation,
  reorderBusy,
  onMoveUp,
  onMoveDown,
}: {
  position: PositionRow;
  groups: PositionGroupRow[];
  isTrainingStation: boolean;
  /** The group is saving a new order. The arrows wait so two taps cannot send overlapping orders. */
  reorderBusy: boolean;
  onMoveUp: (() => void) | undefined;
  onMoveDown: (() => void) | undefined;
}) {
  const { run, isPending, error } = useRun();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(position.name);
  const [groupId, setGroupId] = useState(position.group_id ?? UNGROUPED);

  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={isPending || reorderBusy || !onMoveUp}
            onClick={onMoveUp}
            aria-label={`Move ${position.name} up`}
          >
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={isPending || reorderBusy || !onMoveDown}
            onClick={onMoveDown}
            aria-label={`Move ${position.name} down`}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-ink">{position.name}</p>
          <div className="mt-0.5 flex flex-wrap gap-1">
            <StatusBadge tone={position.is_rateable ? "success" : "neutral"}>
              {position.is_rateable ? "Rateable" : "Not rated"}
            </StatusBadge>
            {isTrainingStation && <StatusBadge tone="info">Training station</StatusBadge>}
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 rounded-full"
          disabled={isPending}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Close" : "Edit"}
        </Button>
      </div>

      {editing && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-line p-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`pos-name-${position.id}`}>Name</Label>
            <Input id={`pos-name-${position.id}`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`pos-group-${position.id}`}>Group</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger id={`pos-group-${position.id}`}>
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
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`pos-rateable-${position.id}`}
              checked={position.is_rateable}
              disabled={isPending}
              onCheckedChange={(value) =>
                run(() => setPositionRateable({ id: position.id, isRateable: value === true }))
              }
            />
            <Label htmlFor={`pos-rateable-${position.id}`}>Show as a column on the Ratings matrix</Label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="rounded-full"
              disabled={isPending || !name.trim()}
              onClick={() =>
                run(
                  () =>
                    updatePosition({
                      id: position.id,
                      name,
                      groupId: groupId === UNGROUPED ? null : groupId,
                    }),
                  () => setEditing(false),
                )
              }
            >
              {isPending ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full text-danger"
              disabled={isPending || isTrainingStation}
              title={isTrainingStation ? "Used by a training roadmap; remove it there first." : undefined}
              onClick={() => {
                if (!window.confirm(positionDeleteConfirm(position.name))) return;
                run(() => deletePosition({ id: position.id }));
              }}
            >
              Delete
            </Button>
          </div>
          {isTrainingStation && (
            <p className="text-[13px] text-muted-ink">
              This station is part of an onboarding roadmap, so it cannot be deleted from here.
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function GroupCard({
  group,
  positions,
  groups,
  trainingStations,
}: {
  group: PositionGroupRow | null;
  positions: PositionRow[];
  groups: PositionGroupRow[];
  trainingStations: ReadonlySet<string>;
}) {
  const { run, isPending, error } = useRun();
  const [renaming, setRenaming] = useState(false);
  const [groupName, setGroupName] = useState(group?.name ?? "");
  const [newPosition, setNewPosition] = useState("");

  const orderedIds = positions.map((p) => p.id);

  function move(id: string, delta: -1 | 1) {
    const next = moveInList(orderedIds, id, delta);
    if (next.join() === orderedIds.join()) return;
    run(() => reorderPositions({ orderedIds: next }));
  }

  return (
    <SectionCard
      title={group ? group.name : "Ungrouped"}
      flush
      action={
        group ? (
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full"
              disabled={isPending}
              onClick={() => setRenaming((v) => !v)}
            >
              {renaming ? "Close" : "Rename"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full text-danger"
              disabled={isPending}
              onClick={() => {
                if (!window.confirm(groupDeleteConfirm(group.name, positions.length))) return;
                run(() => deletePositionGroup({ id: group.id }));
              }}
            >
              Delete
            </Button>
          </div>
        ) : null
      }
    >
      {group && renaming && (
        <form
          className="flex flex-wrap items-end gap-2 border-b border-line px-3 pb-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => renamePositionGroup({ id: group.id, name: groupName }),
              () => setRenaming(false),
            );
          }}
        >
          <Input
            aria-label="Group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="min-w-0 flex-1"
            required
          />
          <Button type="submit" size="sm" variant="secondary" className="rounded-full" disabled={isPending}>
            Save
          </Button>
        </form>
      )}

      <div className="divide-y divide-line">
        {positions.map((position, index) => (
          <PositionItem
            key={position.id}
            position={position}
            groups={groups}
            isTrainingStation={trainingStations.has(position.id)}
            reorderBusy={isPending}
            onMoveUp={index > 0 ? () => move(position.id, -1) : undefined}
            onMoveDown={index < positions.length - 1 ? () => move(position.id, 1) : undefined}
          />
        ))}
        {positions.length === 0 && (
          <p className="px-3 py-3 text-[13px] text-muted-ink">No positions in this group yet.</p>
        )}
      </div>

      <form
        className="flex items-end gap-2 border-t border-line px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => createPosition({ groupId: group?.id ?? null, name: newPosition }),
            () => setNewPosition(""),
          );
        }}
      >
        <Input
          aria-label={`New position in ${group ? group.name : "Ungrouped"}`}
          placeholder="Add a position"
          value={newPosition}
          onChange={(e) => setNewPosition(e.target.value)}
          className="min-w-0 flex-1"
          required
        />
        <Button type="submit" size="sm" variant="secondary" className="shrink-0 rounded-full" disabled={isPending}>
          Add
        </Button>
      </form>
      {error && (
        <p role="alert" className="px-3 pb-3 text-[13px] text-danger">
          {error}
        </p>
      )}
    </SectionCard>
  );
}

/**
 * Admin editor for position_groups and positions behind a live route
 * (docs/STORE-SETUP.md, area "positions"). One card per group, positions
 * ordered the way the Ratings matrix shows its columns; each row expands to
 * rename, regroup, toggle rateable, or delete. The dormant Setups editor
 * (components/setups/positions-manager.tsx) had the same data with no
 * rename, reorder, or rateable control, and no way to reach it.
 */
export function PositionsEditor({
  groups,
  positions,
  trainingStationIds,
}: {
  groups: PositionGroupRow[];
  positions: PositionRow[];
  trainingStationIds: string[];
}) {
  const { run, isPending, error } = useRun();
  const [newGroup, setNewGroup] = useState("");
  const trainingStations = new Set(trainingStationIds);
  const { grouped, ungrouped } = groupPositions(groups, positions);
  // Only an empty store gets the offer. Keying it off the seed group names
  // brought it back after a rename, and one tap then added 19 duplicates.
  const offerDefaultList = shouldOfferDefaultList(positions.length);

  return (
    <div className="flex flex-col gap-4">
      {offerDefaultList && (
        <div className="rounded-xl border border-dashed border-line bg-accent-soft/40 p-3 text-[13px] text-muted-ink">
          No setup positions yet.{" "}
          <button
            type="button"
            className="font-semibold text-accent hover:underline disabled:opacity-50"
            disabled={isPending}
            onClick={() => run(() => seedDefaultPositions())}
          >
            Load the Avondale default list
          </button>{" "}
          to start from, then rename or delete anything that does not match Farmingdale. Safe to
          tap twice.
        </div>
      )}

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => createPositionGroup({ name: newGroup }),
            () => setNewGroup(""),
          );
        }}
      >
        <Input
          aria-label="New group name"
          placeholder="New group (e.g. Kitchen)"
          value={newGroup}
          onChange={(e) => setNewGroup(e.target.value)}
          className="min-w-0 flex-1 rounded-full"
          required
        />
        <Button type="submit" variant="outline" className="shrink-0 rounded-full" disabled={isPending}>
          Add group
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}

      {grouped.map(({ group, positions: groupPositionsList }) => (
        <GroupCard
          key={group.id}
          group={group}
          positions={groupPositionsList}
          groups={groups}
          trainingStations={trainingStations}
        />
      ))}

      {ungrouped.length > 0 && (
        <GroupCard group={null} positions={ungrouped} groups={groups} trainingStations={trainingStations} />
      )}
    </div>
  );
}
