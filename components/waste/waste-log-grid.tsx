"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Heart, Trash2 } from "lucide-react";

import { SearchBar } from "@/components/mobile";
import { logWasteEntry } from "@/app/(app)/waste/actions";
import {
  rollupByCategory,
  rollupByItem,
  type ItemRollupRow,
  type WasteCategoryForRollup,
  type WasteEntryForRollup,
  type WasteItemForRollup,
} from "@/app/(app)/waste/logic";

const ALL_CATEGORIES = "__all__";

function formatCost(cost: number | null | undefined): string {
  return `$${(cost ?? 0).toFixed(2)}`;
}

/**
 * KitchenIQ-style waste grid (docs/DESIGN-SYSTEM.md): a colored category
 * banner with a running total, a search + count row, and a 2-column grid of
 * item cards for one-tap "+1 trash" / "+1 donate" logging. Every tap reuses
 * the existing logWasteEntry action (quantity 1, a note tagging which
 * disposition) -- no new mutation path, no schema change. The banner/card
 * totals are computed with the same rollupByItem/rollupByCategory pure
 * functions the Reports tab already uses (app/(app)/waste/logic.ts), just
 * fed whichever entries the page already has permission to fetch.
 */
export function WasteLogGrid({
  items,
  categories,
  entries,
}: {
  items: WasteItemForRollup[];
  categories: WasteCategoryForRollup[];
  entries: WasteEntryForRollup[];
}) {
  const [categoryId, setCategoryId] = useState<string>(ALL_CATEGORIES);
  const [query, setQuery] = useState("");

  const itemRollup = useMemo(() => rollupByItem(entries, items), [entries, items]);
  const categoryRollup = useMemo(
    () => rollupByCategory(entries, items, categories),
    [entries, items, categories],
  );
  const rollupByItemId = useMemo(
    () => new Map(itemRollup.map((row) => [row.itemId, row])),
    [itemRollup],
  );
  const overallTotal = useMemo(
    () => itemRollup.reduce((sum, row) => sum + (row.totalCost ?? 0), 0),
    [itemRollup],
  );

  const activeCategory = categories.find((category) => category.id === categoryId) ?? null;
  const bannerLabel = activeCategory ? activeCategory.name : "All items";
  const bannerTotal = activeCategory
    ? (categoryRollup.find((row) => row.categoryId === categoryId)?.totalCost ?? 0)
    : overallTotal;

  const trimmedQuery = query.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    if (categoryId !== ALL_CATEGORIES && item.categoryId !== categoryId) return false;
    if (trimmedQuery && !item.name.toLowerCase().includes(trimmedQuery)) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Category banner: a real <select> overlaid on the colored banner so
          switching categories stays a native, keyboard/accessible control
          while the visible content (name + running total) is fully custom. */}
      <div className="relative overflow-hidden rounded-2xl bg-accent px-4 py-3.5 text-white shadow-card">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px] font-bold">
            {bannerLabel}
            <span className="ml-2 text-[13px] font-semibold opacity-90">
              Total: {formatCost(bannerTotal)}
            </span>
          </span>
          <ChevronDown className="h-5 w-5 shrink-0 opacity-90" aria-hidden="true" />
        </div>
        <select
          aria-label="Waste category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          <option value={ALL_CATEGORIES}>All items</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <SearchBar
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search items"
          label="Search waste items"
          containerClassName="flex-1"
        />
        <span className="shrink-0 rounded-full bg-secondary px-3.5 py-2 text-[13px] font-semibold text-muted-ink">
          All ({filteredItems.length})
        </span>
      </div>

      {filteredItems.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card px-4 py-6 text-center text-[13px] text-muted-ink shadow-card">
          {items.length === 0
            ? "No waste items set up yet. Ask a manager to add some in Admin."
            : "No items match your search."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredItems.map((item) => (
            <WasteItemCard key={item.id} item={item} rollup={rollupByItemId.get(item.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function WasteItemCard({
  item,
  rollup,
}: {
  item: WasteItemForRollup;
  rollup: ItemRollupRow | undefined;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingKind, setPendingKind] = useState<"trash" | "donate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function logOne(kind: "trash" | "donate") {
    setError(null);
    setPendingKind(kind);
    startTransition(async () => {
      const result = await logWasteEntry({
        itemId: item.id,
        quantity: 1,
        note: kind === "donate" ? "Donated" : "Trash",
      });
      setPendingKind(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-card p-3 shadow-card">
      <p className="truncate text-[15px] font-semibold text-ink">{item.name}</p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => logOne("trash")}
          aria-label={`Log 1 ${item.name} to trash`}
          className="flex items-center justify-center gap-1 rounded-lg bg-danger-soft px-2 py-2 text-danger transition-opacity disabled:opacity-60"
        >
          <span className="text-[13px] font-bold">{pendingKind === "trash" ? "..." : "+1"}</span>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => logOne("donate")}
          aria-label={`Log 1 ${item.name} donated`}
          className="flex items-center justify-center gap-1 rounded-lg bg-success-soft px-2 py-2 text-success transition-opacity disabled:opacity-60"
        >
          <span className="text-[13px] font-bold">{pendingKind === "donate" ? "..." : "+1"}</span>
          <Heart className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <p className="text-[12px] text-muted-ink">{rollup?.entryCount ?? 0} tracked</p>
      <p className="text-[13px] font-semibold text-ink">Total: {formatCost(rollup?.totalCost)}</p>

      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}
