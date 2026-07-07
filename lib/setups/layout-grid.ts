/**
 * Pure coordinate math for the visual store layout editor
 * (ARCHITECTURE.md "Highlight badges & store layout": "a layout editor lets
 * us arrange position tiles on a canvas mirroring the actual store floor
 * plan"). Kept separate from the drag-and-drop component
 * (components/setups/layout-canvas.tsx) so the snapping/clamping logic is
 * unit-testable without a DOM.
 */

export const GRID_COLUMNS = 12;
export const GRID_ROWS = 8;

export interface TilePosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rounds a raw pixel-ish coordinate to the nearest grid cell. */
export function snapToGrid(value: number): number {
  return Math.round(value);
}

/** Clamps a tile so it stays fully inside the canvas grid bounds. */
export function clampTileToBounds(
  tile: TilePosition,
  columns = GRID_COLUMNS,
  rows = GRID_ROWS,
): TilePosition {
  const w = Math.max(1, Math.min(tile.w, columns));
  const h = Math.max(1, Math.min(tile.h, rows));
  const x = Math.max(0, Math.min(snapToGrid(tile.x), columns - w));
  const y = Math.max(0, Math.min(snapToGrid(tile.y), rows - h));
  return { x, y, w, h };
}

/**
 * Computes a tile's new top-left cell after a drag, given the cell the drag
 * started in and the cell the pointer ended in (both grid coordinates, not
 * pixels — the canvas component converts pointer position to a cell before
 * calling this).
 */
export function moveTile(
  tile: TilePosition,
  fromCell: { x: number; y: number },
  toCell: { x: number; y: number },
  columns = GRID_COLUMNS,
  rows = GRID_ROWS,
): TilePosition {
  const dx = toCell.x - fromCell.x;
  const dy = toCell.y - fromCell.y;
  return clampTileToBounds(
    { x: tile.x + dx, y: tile.y + dy, w: tile.w, h: tile.h },
    columns,
    rows,
  );
}
