/**
 * Pure rollup/report logic for the Waste module (PLAN.md S5: "admin CRUD,
 * rollup views by item/category/period"). Kept dependency-free (no Supabase
 * client, no "use server") so it can run both on the server (app/(app)/waste
 * /page.tsx fetches rows, then calls these) and in the client
 * (components/waste/waste-reports.tsx re-slices by period without a round
 * trip) -- and so it's directly unit-testable (logic.test.ts).
 */

export const PERIOD_KEYS = ["week", "month", "quarter", "all"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export type WasteUnit = "each" | "lb" | "oz";

export interface WasteEntryForRollup {
  id: string;
  itemId: string;
  quantity: number;
  loggedAt: string; // ISO timestamp
}

export interface WasteItemForRollup {
  id: string;
  name: string;
  categoryId: string | null;
  unit: WasteUnit;
  unitCost: number | null;
}

export interface WasteCategoryForRollup {
  id: string;
  name: string;
}

const PERIOD_DAYS: Record<Exclude<PeriodKey, "all">, number> = {
  week: 7,
  month: 30,
  quarter: 90,
};

/**
 * Start of the rolling window for `period`, relative to `now`. Returns null
 * for "all" (no lower bound).
 */
export function periodStart(period: PeriodKey, now: Date): Date | null {
  if (period === "all") return null;
  const days = PERIOD_DAYS[period];
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  return start;
}

/**
 * Filters entries to those logged within [periodStart(period, now), now].
 * Entries logged after `now` (clock skew, bad data) are excluded rather than
 * inflating a report.
 */
export function filterEntriesByPeriod(
  entries: WasteEntryForRollup[],
  period: PeriodKey,
  now: Date = new Date(),
): WasteEntryForRollup[] {
  const start = periodStart(period, now);
  return entries.filter((entry) => {
    const loggedAt = new Date(entry.loggedAt);
    if (loggedAt > now) return false;
    if (start && loggedAt < start) return false;
    return true;
  });
}

export interface ItemRollupRow {
  itemId: string;
  itemName: string;
  unit: WasteUnit;
  totalQuantity: number;
  entryCount: number;
  /** Sum of quantity * unit_cost across entries; null when no cost is set for the item. */
  totalCost: number | null;
}

/**
 * Groups entries by item. Quantities are only ever summed within one item,
 * so the unit is always unambiguous (unlike the category rollup below,
 * where items can have different units).
 *
 * KNOWN LIMITATION: cost is computed from the item's *current*
 * `unitCost` (waste_items.unit_cost), not a value captured at log time.
 * waste_entries (supabase/migrations/20260707000900_waste.sql) has no
 * unit_cost column to snapshot into, and this stream cannot add one (frozen
 * schema per PLAN.md ground rules -- see the idempotency note atop
 * app/(app)/waste/actions.ts). Practical effect: editing an item's cost in
 * Admin retroactively changes every past rollup that references it, so a
 * historical report re-run after a price change will not match what was
 * shown at the time. Fixing this for real needs a schema change (add
 * waste_entries.unit_cost, populate it in logWasteEntry, and rollup from
 * the entry's own value instead of the item's) -- out of scope here.
 */
export function rollupByItem(
  entries: WasteEntryForRollup[],
  items: WasteItemForRollup[],
): ItemRollupRow[] {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const rows = new Map<string, ItemRollupRow>();

  for (const entry of entries) {
    const item = itemById.get(entry.itemId);
    if (!item) continue; // orphaned/unknown item id: skip rather than crash the report

    const cost = item.unitCost != null ? entry.quantity * item.unitCost : null;
    const existing = rows.get(item.id);

    if (existing) {
      existing.totalQuantity += entry.quantity;
      existing.entryCount += 1;
      if (cost != null) {
        existing.totalCost = (existing.totalCost ?? 0) + cost;
      }
    } else {
      rows.set(item.id, {
        itemId: item.id,
        itemName: item.name,
        unit: item.unit,
        totalQuantity: entry.quantity,
        entryCount: 1,
        totalCost: cost,
      });
    }
  }

  return [...rows.values()].sort((a, b) => b.totalQuantity - a.totalQuantity);
}

export interface CategoryRollupRow {
  categoryId: string | null;
  categoryName: string;
  entryCount: number;
  /**
   * Sum of quantity * unit_cost across every entry in the category. Total
   * *quantity* is intentionally not summed here: items in the same category
   * can use different units (each/lb/oz), so a raw quantity sum would be
   * meaningless. Cost is the common unit across items.
   *
   * Same not-snapshotted-per-entry limitation as rollupByItem's totalCost
   * above (see that doc comment).
   */
  totalCost: number | null;
}

const UNCATEGORIZED_KEY = "__uncategorized__";

export function rollupByCategory(
  entries: WasteEntryForRollup[],
  items: WasteItemForRollup[],
  categories: WasteCategoryForRollup[],
): CategoryRollupRow[] {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
  const rows = new Map<string, CategoryRollupRow>();

  for (const entry of entries) {
    const item = itemById.get(entry.itemId);
    if (!item) continue;

    const key = item.categoryId ?? UNCATEGORIZED_KEY;
    const cost = item.unitCost != null ? entry.quantity * item.unitCost : null;
    const existing = rows.get(key);

    if (existing) {
      existing.entryCount += 1;
      if (cost != null) {
        existing.totalCost = (existing.totalCost ?? 0) + cost;
      }
    } else {
      rows.set(key, {
        categoryId: item.categoryId,
        categoryName: item.categoryId
          ? (categoryNameById.get(item.categoryId) ?? "Category")
          : "Uncategorized",
        entryCount: 1,
        totalCost: cost,
      });
    }
  }

  return [...rows.values()].sort((a, b) => (b.totalCost ?? 0) - (a.totalCost ?? 0));
}
