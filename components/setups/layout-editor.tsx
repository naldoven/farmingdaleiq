"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChipRow, FilterChip } from "@/components/mobile";
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
          <SelectTrigger className="w-56 rounded-full">
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
            <button
              type="button"
              aria-label="Delete layout"
              disabled={isPending}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-danger hover:bg-danger-soft disabled:opacity-50"
              onClick={() => run(() => deleteLayout({ id: selectedLayoutId }))}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      <ChipRow aria-label="Layout editor view">
        <FilterChip type="button" active={view === "canvas"} onClick={() => setView("canvas")}>
          Canvas
        </FilterChip>
        <FilterChip type="button" active={view === "list"} onClick={() => setView("list")}>
          List
        </FilterChip>
      </ChipRow>

      <form
        className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-line p-3"
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
          className="rounded-full"
          required
        />
        <Select value={newLayoutDayPart} onValueChange={setNewLayoutDayPart}>
          <SelectTrigger className="w-48 rounded-full">
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

      {error && <p className="text-[13px] text-danger">{error}</p>}

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
              <SelectTrigger className="w-56 rounded-full">
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
              className="max-w-xs rounded-full"
            />
            <Button type="submit" size="sm" disabled={isPending}>
              Place on canvas
            </Button>
          </form>

          {view === "canvas" ? (
            <div
              className="grid gap-1 rounded-2xl border border-line bg-canvas p-2"
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
                    className="rounded-sm border border-dashed border-line/70"
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
                  className="z-10 flex cursor-move items-center justify-center overflow-hidden rounded-lg border border-accent/40 bg-accent-soft p-1 text-center text-[13px] font-semibold leading-tight text-ink shadow-card"
                  style={{
                    gridColumn: `${tile.x + 1} / span ${tile.w}`,
                    gridRow: `${tile.y + 1} / span ${tile.h}`,
                  }}
                  title="Drag to move"
                >
                  <span className="truncate">
                    {tile.area_label || (tile.position_id ? positionName.get(tile.position_id) : "Tile")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-card">
              {currentTiles.map((tile) => (
                <div key={tile.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="text-[13px] text-ink">
                    {tile.area_label || (tile.position_id ? positionName.get(tile.position_id) : "Tile")} — x:
                    {tile.x} y:{tile.y} w:{tile.w} h:{tile.h}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label="Move left"
                      disabled={isPending}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-ink hover:bg-secondary disabled:opacity-30"
                      onClick={() =>
                        run(() => moveLayoutTile({ tileId: tile.id, x: Math.max(0, tile.x - 1), y: tile.y }))
                      }
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move right"
                      disabled={isPending}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-ink hover:bg-secondary disabled:opacity-30"
                      onClick={() => run(() => moveLayoutTile({ tileId: tile.id, x: tile.x + 1, y: tile.y }))}
                    >
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="Remove tile"
                      disabled={isPending}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-ink hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                      onClick={() => run(() => deleteTile({ id: tile.id }))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </span>
                </div>
              ))}
              {currentTiles.length === 0 && (
                <p className="px-3 py-3 text-[13px] text-muted-ink">No tiles placed yet.</p>
              )}
            </div>
          )}
        </>
      )}

      {layouts.length === 0 && (
        <p className="text-[13px] text-muted-ink">Create a layout above to start placing tiles.</p>
      )}
    </div>
  );
}
