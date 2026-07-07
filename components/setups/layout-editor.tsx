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
  createLayout,
  deleteLayout,
  deleteTile,
  moveLayoutTile,
  setLayoutActive,
  upsertTile,
} from "@/app/(app)/setups/templates/actions";
import { GRID_COLUMNS, GRID_ROWS } from "@/lib/setups/layout-grid";

export interface DayPartRow {
  id: string;
  name: string;
}

export interface PositionRow {
  id: string;
  group_id: string | null;
  name: string;
}

export interface StoreLayoutRow {
  id: string;
  name: string;
  day_part_id: string | null;
  active: boolean;
}

export interface LayoutTileRow {
  id: string;
  layout_id: string;
  position_id: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  area_label: string | null;
}

const NONE = "none";

export function LayoutEditor({
  dayParts,
  positions,
  layouts,
  tiles,
}: {
  dayParts: DayPartRow[];
  positions: PositionRow[];
  layouts: StoreLayoutRow[];
  tiles: LayoutTileRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"canvas" | "list">("canvas");
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>(layouts[0]?.id ?? "");
  const [newLayoutName, setNewLayoutName] = useState("");
  const [newLayoutDayPart, setNewLayoutDayPart] = useState<string>(NONE);
  const [addPositionId, setAddPositionId] = useState<string>("");
  const [addAreaLabel, setAddAreaLabel] = useState("");
  const [draggingTileId, setDraggingTileId] = useState<string | null>(null);

  const positionName = new Map(positions.map((p) => [p.id, p.name]));
  const currentTiles = tiles.filter((t) => t.layout_id === selectedLayoutId);

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

  function handleDrop(cellX: number, cellY: number) {
    if (!draggingTileId) return;
    const tileId = draggingTileId;
    setDraggingTileId(null);
    run(() => moveLayoutTile({ tileId, x: cellX, y: cellY }));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Select value={selectedLayoutId} onValueChange={setSelectedLayoutId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Choose a layout" />
          </SelectTrigger>
          <SelectContent>
            {layouts.map((layout) => (
              <SelectItem key={layout.id} value={layout.id}>
                {layout.name} {layout.active ? "" : "(inactive)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedLayoutId && (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => {
                const layout = layouts.find((l) => l.id === selectedLayoutId);
                if (!layout) return;
                run(() => setLayoutActive({ id: layout.id, active: !layout.active }));
              }}
            >
              {layouts.find((l) => l.id === selectedLayoutId)?.active ? "Deactivate" : "Activate"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => run(() => deleteLayout({ id: selectedLayoutId }))}
            >
              Delete layout
            </Button>
          </>
        )}

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setView(view === "canvas" ? "list" : "canvas")}
        >
          {view === "canvas" ? "Switch to list view" : "Switch to canvas view"}
        </Button>
      </div>

      <form
        className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const result = await createLayout({
              name: newLayoutName,
              dayPartId: newLayoutDayPart === NONE ? null : newLayoutDayPart,
            });
            if (result.ok && "data" in result) {
              setNewLayoutName("");
              setNewLayoutDayPart(NONE);
              setSelectedLayoutId(result.data.id);
            }
            return result;
          });
        }}
      >
        <Input
          aria-label="New layout name"
          placeholder="New layout name (e.g. Main floor)"
          value={newLayoutName}
          onChange={(e) => setNewLayoutName(e.target.value)}
          required
        />
        <Select value={newLayoutDayPart} onValueChange={setNewLayoutDayPart}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Day part" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Any day part</SelectItem>
            {dayParts.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline" disabled={isPending}>
          New layout
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {selectedLayoutId && (
        <>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!addPositionId) return;
              run(async () => {
                const result = await upsertTile({
                  layoutId: selectedLayoutId,
                  positionId: addPositionId,
                  areaLabel: addAreaLabel,
                  x: 0,
                  y: 0,
                  w: 2,
                  h: 1,
                });
                if (result.ok) {
                  setAddPositionId("");
                  setAddAreaLabel("");
                }
                return result;
              });
            }}
          >
            <Select value={addPositionId} onValueChange={setAddPositionId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Add a position tile" />
              </SelectTrigger>
              <SelectContent>
                {positions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label="Area label"
              placeholder="Area label (e.g. Kitchen line)"
              value={addAreaLabel}
              onChange={(e) => setAddAreaLabel(e.target.value)}
              className="max-w-xs"
            />
            <Button type="submit" size="sm" disabled={isPending}>
              Place on canvas
            </Button>
          </form>

          {view === "canvas" ? (
            <div
              className="grid gap-1 rounded-md border border-border bg-muted/30 p-2"
              style={{
                gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${GRID_ROWS}, 2.5rem)`,
              }}
            >
              {Array.from({ length: GRID_COLUMNS * GRID_ROWS }).map((_, i) => {
                const cellX = i % GRID_COLUMNS;
                const cellY = Math.floor(i / GRID_COLUMNS);
                return (
                  <div
                    key={i}
                    className="rounded-sm border border-dashed border-border/50"
                    style={{ gridColumn: cellX + 1, gridRow: cellY + 1 }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(cellX, cellY)}
                  />
                );
              })}
              {currentTiles.map((tile) => (
                <div
                  key={tile.id}
                  draggable
                  onDragStart={() => setDraggingTileId(tile.id)}
                  className="z-10 flex cursor-move items-center justify-center rounded-md border border-primary/40 bg-primary/15 p-1 text-center text-xs font-medium leading-tight text-foreground shadow-sm"
                  style={{
                    gridColumn: `${tile.x + 1} / span ${tile.w}`,
                    gridRow: `${tile.y + 1} / span ${tile.h}`,
                  }}
                  title="Drag to move"
                >
                  <span>
                    {tile.area_label || (tile.position_id ? positionName.get(tile.position_id) : "Tile")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {currentTiles.map((tile) => (
                <li
                  key={tile.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
                >
                  <span>
                    {tile.area_label || (tile.position_id ? positionName.get(tile.position_id) : "Tile")} —
                    x:{tile.x} y:{tile.y} w:{tile.w} h:{tile.h}
                  </span>
                  <span className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => run(() => moveLayoutTile({ tileId: tile.id, x: Math.max(0, tile.x - 1), y: tile.y }))}
                    >
                      Left
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => run(() => moveLayoutTile({ tileId: tile.id, x: tile.x + 1, y: tile.y }))}
                    >
                      Right
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => run(() => deleteTile({ id: tile.id }))}
                    >
                      Remove
                    </Button>
                  </span>
                </li>
              ))}
              {currentTiles.length === 0 && (
                <li className="text-sm text-muted-foreground">No tiles placed yet.</li>
              )}
            </ul>
          )}
        </>
      )}

      {layouts.length === 0 && (
        <p className="text-sm text-muted-foreground">Create a layout above to start placing tiles.</p>
      )}
    </div>
  );
}
