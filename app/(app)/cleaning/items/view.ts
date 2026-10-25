import {
  HALVES,
  ITEM_KINDS,
  type Half,
  type ItemKind,
} from "@/app/(app)/cleaning/constants";
import { cadenceLabel, type MarkupData } from "@/app/(app)/cleaning/logic";
import type { ItemRow, PhotoRow } from "@/app/(app)/cleaning/queries";
import type { ItemDetailsValue } from "@/components/cleaning/item-details-fields";
import type { ItemListRow } from "@/components/cleaning/item-list";

/**
 * Pure view helpers for the master-list pages. Kept apart from the pages so
 * the shaping of database rows can be tested without Supabase.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres rejects a malformed uuid with a 500-style error; a bad URL should 404 instead. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

function isUnit(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
}

/**
 * Reads the markup jsonb column defensively. It is written by our own route
 * after zod validation, but a bad row should show a photo without a drawing,
 * not take the whole list down.
 */
export function parseMarkup(json: unknown): MarkupData | null {
  if (typeof json !== "object" || json === null || !("strokes" in json)) return null;
  const rawStrokes = (json as { strokes: unknown }).strokes;
  if (!Array.isArray(rawStrokes)) return null;

  const strokes: MarkupData["strokes"] = [];
  for (const raw of rawStrokes) {
    const rawPoints = (raw as { points?: unknown } | null)?.points;
    if (!Array.isArray(rawPoints)) continue;
    const points = rawPoints.filter(
      (p): p is [number, number] => Array.isArray(p) && p.length === 2 && isUnit(p[0]) && isUnit(p[1]),
    );
    if (points.length > 0) strokes.push({ points });
  }
  return strokes.length > 0 ? { strokes } : null;
}

function asKind(value: string): ItemKind {
  return (ITEM_KINDS as readonly string[]).includes(value) ? (value as ItemKind) : "constant";
}

function asHalf(value: string): Half {
  return (HALVES as readonly string[]).includes(value) ? (value as Half) : "am";
}

/** A stored item as the form's value. */
export function itemToDetailsValue(item: ItemRow): ItemDetailsValue {
  return {
    zoneId: item.zone_id,
    name: item.name,
    kind: asKind(item.kind),
    daysOfWeek: [...(item.days_of_week ?? [])].sort((a, b) => a - b),
    half: asHalf(item.half),
    intervalWeeks: item.interval_weeks,
    ifNeeded: item.if_needed,
    note: item.note ?? "",
  };
}

/**
 * cadenceLabel prints days in the order stored. The schema stores them sorted,
 * but nothing in the table enforces it, so sort here rather than show "Fri, Tue".
 */
export function itemCadence(item: ItemRow): string {
  return cadenceLabel({ ...item, days_of_week: item.days_of_week ? [...item.days_of_week].sort((a, b) => a - b) : null });
}

/** Rows for the list: draft and active items only, with their photo resolved. */
export function toListRows(
  items: ItemRow[],
  photos: Map<string, PhotoRow>,
  signedUrls: Map<string, string>,
): ItemListRow[] {
  const rows: ItemListRow[] = [];
  for (const item of items) {
    if (item.status !== "draft" && item.status !== "active") continue;
    const photo = photos.get(item.id);
    const photoUrl = photo ? (signedUrls.get(photo.storage_path) ?? null) : null;
    rows.push({
      id: item.id,
      zone_id: item.zone_id,
      name: item.name,
      status: item.status,
      cadence: itemCadence(item),
      ifNeeded: item.if_needed,
      photoUrl,
      photoMissing: Boolean(photo) && !photoUrl,
      markup: photo ? parseMarkup(photo.markup) : null,
    });
  }
  return rows;
}

/**
 * Splits ids into batches. The photo lookup puts every id in the request URL,
 * and a few hundred uuids can pass the gateway's URL limit.
 */
export function chunk<T>(values: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < values.length; i += size) batches.push(values.slice(i, i + size));
  return batches;
}
