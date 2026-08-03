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
 * Cost of ONE waste entry, in integer cents. Unit cost is a dollar amount
 * (waste_items.unit_cost) that often has no exact binary-float representation
 * (e.g. 1.15 is stored as 1.15000000000000001), so a naive
 * `(quantity * unitCost).toFixed(2)` rounds the wrong way: 1.5 * 1.15 evaluates
 * to 1.7249999999999999 and prints "$1.72" when the true money value is $1.73.
 *
 * The fix is to strip the float noise from the FULL product rather than to snap
 * the unit cost to whole cents first. Snapping first discarded up to 0.5c per
 * *unit*, which quantity then multiplied: an oz-priced item at $0.004/oz
 * collapsed to 0c and vanished from every cost rollup, and 128 x $0.125
 * reported $16.64 instead of $16.00. Rounding the product to 6 decimals strips
 * any residual binary-representation noise, and the single Math.round then
 * resolves a true half-cent upward: 1.5 x 1.15 x 100 lands on exactly 172.5,
 * which rounds to 173 -> $1.73.
 *
 * Everything downstream sums these integer cents (associative and exact), so
 * the by-item and by-category rollups can never disagree by a cent, and a
 * 0.1 + 0.2 style set never drifts. Returns null when the item has no unit cost
 * (cost unknown), which is distinct from a real 0 -- and also when either input
 * is non-finite, so a NaN/Infinity unit_cost surfaces as the "—" placeholder
 * instead of rendering "$NaN.NaN" across every report.
 */
export function entryCostCents(quantity: number, unitCost: number | null): number | null {
  if (unitCost == null) return null;
  if (!Number.isFinite(quantity) || !Number.isFinite(unitCost)) return null;
  return Math.round(Number((quantity * unitCost * 100).toFixed(6)));
}

/**
 * Single money-formatting convention for the whole Waste module. Takes integer
 * cents and renders "$X.XX" using integer arithmetic (never divides back into a
 * float), so it round-trips exactly. A null value (no unit cost set) renders as
 * the shared "no cost" placeholder rather than a misleading "$0.00" -- the one
 * convention both waste-reports.tsx and waste-log-grid.tsx now use.
 */
export function formatCentsAsUsd(cents: number | null): string {
  if (cents == null) return "—";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}$${dollars}.${remainder.toString().padStart(2, "0")}`;
}

/**
 * Milliseconds that wall-clock time in `timeZone` is ahead of UTC at `date`.
 * Derived by formatting the instant in the zone and reading it back as if the
 * parts were UTC -- the standard Intl trick, no dependency required.
 */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // Intl renders midnight as hour 24 in some ICU versions; normalize to 0.
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asIfUtc - date.getTime();
}

/**
 * YYYY-MM-DD for `now` in the store's IANA timezone. Mirrors the FIQ-12 pattern
 * already used by the checklists cron (app/(app)/checklists/logic.ts
 * storeLocalNow) and catering (storeLocalDate), kept as a local copy so Waste's
 * day-boundary math doesn't depend on another module's file.
 */
export function storeLocalDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * The UTC instants bounding one store-local calendar day, as ISO strings for a
 * `logged_at >= start AND logged_at < end` range query.
 *
 * Previously both the /waste date filter and the team dashboard's "today" tile
 * built these from `${date}T00:00:00.000Z` -- a UTC day. For a store on
 * America/New_York the UTC day rolls at 8pm local, so from 8pm onward the
 * dashboard reported "No waste logged today" while the closing shift was still
 * logging, and that waste then surfaced under tomorrow. Closing is when most
 * waste happens, so this hid the single most important slice of the data.
 *
 * Two passes: the offset itself depends on the instant, so the first pass gives
 * an approximate UTC time and the second re-reads the offset at that instant.
 * This resolves DST transition days correctly.
 */
export function storeDayRangeUtc(
  date: string,
  timeZone: string,
): { startIso: string; endIso: string } {
  const [year, month, day] = date.split("-").map(Number);

  const toUtc = (y: number, m: number, d: number): Date => {
    const wallClock = Date.UTC(y, m - 1, d, 0, 0, 0);
    let instant = wallClock - zoneOffsetMs(new Date(wallClock), timeZone);
    instant = wallClock - zoneOffsetMs(new Date(instant), timeZone);
    return new Date(instant);
  };

  const start = toUtc(year, month, day);
  // Advance by one calendar day, not 24h, so DST-shortened/lengthened days
  // still end exactly at the next local midnight.
  const nextLocal = new Date(Date.UTC(year, month - 1, day + 1));
  const end = toUtc(
    nextLocal.getUTCFullYear(),
    nextLocal.getUTCMonth() + 1,
    nextLocal.getUTCDate(),
  );

  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/**
 * Sums a set of rollup rows into one integer-cents total, reporting how many
 * logged ENTRIES within them had no cost.
 *
 * Callers used to do `sum + (row.totalCostCents ?? 0)` inline, which silently
 * turned "cost unknown" into "cost zero" and then printed the result as a
 * definite dollar figure -- a category whose items have no unit_cost rendered
 * "$0.00", indistinguishable from a genuinely waste-free category. Returning
 * `unknownCount` alongside the total lets the UI mark the number as partial
 * instead of overstating its own confidence. The count is per ENTRY, not per
 * row -- see the note inside the loop.
 */
export function sumCostCents(
  rows: { totalCostCents: number | null; unknownEntryCount?: number }[],
): { totalCents: number | null; unknownCount: number } {
  let totalCents: number | null = null;
  let unknownCount = 0;

  for (const row of rows) {
    // Prefer the row's own per-ENTRY count. A category row's totalCostCents is
    // null only when EVERY entry in it lacks a cost, so keying off null alone
    // missed the common case -- one costed item plus twenty un-costed ones
    // produced a non-null total and reported zero unknowns, printing a
    // confident figure that silently omitted most of the waste.
    unknownCount += row.unknownEntryCount ?? (row.totalCostCents == null ? 1 : 0);
    if (row.totalCostCents == null) continue;
    totalCents = (totalCents ?? 0) + row.totalCostCents;
  }

  return { totalCents, unknownCount };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Start of the rolling window for `period`, relative to `now`. Returns null
 * for "all" (no lower bound).
 *
 * Subtracts an exact number of 24h days rather than using
 * `start.setDate(start.getDate() - days)`. The setDate form is local-calendar
 * math: it preserves the local wall clock, so across a US DST transition the
 * "7 day" window was really 167h or 169h depending on which side of the change
 * you were on. Worse, these rollups are computed in "use client" components
 * that Next also server-renders, so the window was evaluated once on the server
 * (UTC on Vercel) and again in the browser (store-local) -- a boundary entry
 * could land inside one and outside the other, producing a hydration mismatch
 * and a table whose numbers changed after hydration. Exact-millisecond math is
 * identical in every timezone.
 */
export function periodStart(period: PeriodKey, now: Date): Date | null {
  if (period === "all") return null;
  const days = PERIOD_DAYS[period];
  return new Date(now.getTime() - days * MS_PER_DAY);
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
  /**
   * Sum of each entry's cost in INTEGER CENTS (see entryCostCents); null when
   * no cost is set for the item. Kept as cents, not dollars, so callers sum and
   * compare without reintroducing float drift; format at the edge with
   * formatCentsAsUsd.
   */
  totalCostCents: number | null;
  /**
   * How many of this row's entries had NO cost (the item has no unit_cost).
   * Tracked per entry so a caller can tell "nothing was wasted" apart from
   * "some of what was wasted has no price on it" -- totalCostCents alone can't,
   * because it goes non-null as soon as a single entry is costed.
   */
  unknownEntryCount: number;
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

    const costCents = entryCostCents(entry.quantity, item.unitCost);
    const existing = rows.get(item.id);

    if (existing) {
      existing.totalQuantity += entry.quantity;
      existing.entryCount += 1;
      if (costCents != null) {
        existing.totalCostCents = (existing.totalCostCents ?? 0) + costCents;
      } else {
        existing.unknownEntryCount += 1;
      }
    } else {
      rows.set(item.id, {
        itemId: item.id,
        itemName: item.name,
        unit: item.unit,
        totalQuantity: entry.quantity,
        entryCount: 1,
        totalCostCents: costCents,
        unknownEntryCount: costCents == null ? 1 : 0,
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
   * Sum of each entry's cost in INTEGER CENTS across the category (see
   * entryCostCents). Uses the identical per-entry cents computation as
   * rollupByItem, so summing the item rows and summing the category rows for
   * the same entries always yields the same grand total. Total *quantity* is
   * intentionally not summed here: items in the same category can use different
   * units (each/lb/oz), so a raw quantity sum would be meaningless. Cost is the
   * common unit across items.
   *
   * Same not-snapshotted-per-entry limitation as rollupByItem's totalCostCents
   * above (see that doc comment).
   */
  totalCostCents: number | null;
  /** Entries in this category whose cost is unknown. See ItemRollupRow. */
  unknownEntryCount: number;
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
    const costCents = entryCostCents(entry.quantity, item.unitCost);
    const existing = rows.get(key);

    if (existing) {
      existing.entryCount += 1;
      if (costCents != null) {
        existing.totalCostCents = (existing.totalCostCents ?? 0) + costCents;
      } else {
        existing.unknownEntryCount += 1;
      }
    } else {
      rows.set(key, {
        categoryId: item.categoryId,
        categoryName: item.categoryId
          ? (categoryNameById.get(item.categoryId) ?? "Category")
          : "Uncategorized",
        entryCount: 1,
        totalCostCents: costCents,
        unknownEntryCount: costCents == null ? 1 : 0,
      });
    }
  }

  return [...rows.values()].sort((a, b) => (b.totalCostCents ?? 0) - (a.totalCostCents ?? 0));
}
