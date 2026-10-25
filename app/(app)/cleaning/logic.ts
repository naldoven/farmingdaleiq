/**
 * Pure helpers for the Cleaning module (docs/CLEANING-PLAN.md). No Supabase,
 * Next or zod imports, so client components and the walkthrough route share
 * them and tests need no database.
 */

import { STORE_WEEKDAYS, type Half } from "@/app/(app)/cleaning/constants";

export interface CadenceLike {
  kind: string;
  days_of_week: number[] | null;
  half: string;
  interval_weeks: number | null;
}

const HALF_LABEL: Record<Half, string> = { am: "AM", pm: "PM", either: "AM or PM" };

function halfLabel(half: string): string {
  return HALF_LABEL[half as Half] ?? half.toUpperCase();
}

/** "Tue PM", "Mon, Thu AM", "Every 2 weeks, AM or PM". */
export function cadenceLabel(item: CadenceLike): string {
  if (item.kind === "constant") {
    const days = (item.days_of_week ?? [])
      .map((d) => STORE_WEEKDAYS.find((w) => w.value === d)?.short)
      .filter(Boolean)
      .join(", ");
    return `${days || "No day"} ${halfLabel(item.half)}`;
  }
  const weeks = item.interval_weeks ?? 0;
  const every = weeks === 1 ? "Every week" : `Every ${weeks} weeks`;
  return `${every}, ${halfLabel(item.half)}`;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * The storage path for a walkthrough photo. Chosen on the server from the
 * phone's photo id, never sent by the client (a Quote Tool lesson: never
 * trust the client for a storage path). The same photo id always maps to the
 * same path, which is what lets a retried upload detect "already there".
 */
export function photoStoragePath(photoId: string, mimeType: string): string | null {
  const extension = EXTENSION_BY_MIME[mimeType];
  return extension ? `items/${photoId}.${extension}` : null;
}

/** Postgres unique violation, as surfaced by PostgREST. */
export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}

/** Storage "object already exists" on an upsert:false upload. */
export function isStorageDuplicate(error: { message?: string; statusCode?: string | number } | null | undefined): boolean {
  if (!error) return false;
  const status = String(error.statusCode ?? "");
  return status === "409" || /already exists|duplicate/i.test(error.message ?? "");
}

export interface ZoneLike {
  id: string;
  sort: number;
}

/** Groups rows under their zone, in zone sort order, dropping empty zones. */
export function groupByZone<Z extends ZoneLike, T extends { zone_id: string }>(
  zones: Z[],
  rows: T[],
): { zone: Z; rows: T[] }[] {
  return [...zones]
    .sort((a, b) => a.sort - b.sort)
    .map((zone) => ({ zone, rows: rows.filter((r) => r.zone_id === zone.id) }))
    .filter((group) => group.rows.length > 0);
}

/** SVG polyline `points` for one normalized 0-1 stroke. */
export function strokePoints(points: [number, number][]): string {
  return points.map(([x, y]) => `${round4(x)},${round4(y)}`).join(" ");
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Drops points closer than `minGap` (normalized units) to the previous kept
 * point, so a slow finger does not produce thousands of near-duplicate
 * points. The last point is always kept so a stroke ends where the finger
 * lifted.
 */
export function thinStroke(points: [number, number][], minGap = 0.004): [number, number][] {
  if (points.length <= 2) return points;
  const kept: [number, number][] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = kept[kept.length - 1];
    const [x, y] = points[i];
    if (Math.hypot(x - px, y - py) >= minGap) kept.push(points[i]);
  }
  kept.push(points[points.length - 1]);
  return kept;
}

/** Clamps a pointer position inside an element box to normalized 0-1. */
export function normalizePoint(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
): [number, number] {
  const x = box.width > 0 ? (clientX - box.left) / box.width : 0;
  const y = box.height > 0 ? (clientY - box.top) / box.height : 0;
  return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
}
