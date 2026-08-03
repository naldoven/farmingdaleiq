"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Heart, Trash2 } from "lucide-react";

import { SearchBar } from "@/components/mobile";
import { logWasteEntry } from "@/app/(app)/waste/actions";
import { WasteQuantitySheet } from "@/components/waste/quantity-sheet";
import { safeAction } from "@/lib/errors/safe-action";
import {
  formatCentsAsUsd,
  rollupByCategory,
  rollupByItem,
  sumCostCents,
  type ItemRollupRow,
  type WasteCategoryForRollup,
  type WasteEntryForRollup,
  type WasteItemForRollup,
} from "@/app/(app)/waste/logic";

const ALL_CATEGORIES = "__all__";

/**
 * KitchenIQ-style waste grid (docs/DESIGN-SYSTEM.md): a colored category
 * banner with a running total, a search + count row, and a 2-column grid of
 * item cards with "+1 trash" / "+1 donate" buttons. A tap logs 1; pressing
 * and holding opens the KitchenIQ-style quantity sheet (WasteQuantitySheet)
 * where the amount is stepped or typed, an optional reason/note attached,
 * and the whole thing committed as ONE entry. Either way every gesture
 * reuses the existing logWasteEntry action (the note tags disposition and
 * reason) -- no new mutation path, no schema change. The banner/card totals
 * are computed with the same rollupByItem/rollupByCategory pure functions
 * the Reports tab already uses (app/(app)/waste/logic.ts), just fed
 * whichever entries the page already has permission to fetch.
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
  // sumCostCents reports how many logged ENTRIES had no cost, rather than
  // folding them to zero. The old `sum + (row.totalCostCents ?? 0)` printed a
  // definite dollar figure that silently omitted every un-costed entry. Counting
  // per entry (not per row) matters because a category row's total goes non-null
  // as soon as ONE of its entries is priced, so a mixed-cost category would
  // otherwise report zero unknowns. The total is suffixed with "+" and explained.
  const overallTotal = useMemo(() => sumCostCents(itemRollup), [itemRollup]);

  const activeCategory = categories.find((category) => category.id === categoryId) ?? null;
  const bannerLabel = activeCategory ? activeCategory.name : "All items";
  const bannerTotal = activeCategory
    ? sumCostCents(categoryRollup.filter((row) => row.categoryId === categoryId))
    : overallTotal;
  const bannerTotalLabel =
    formatCentsAsUsd(bannerTotal.totalCents ?? 0) + (bannerTotal.unknownCount > 0 ? "+" : "");

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
            <span
              className="ml-2 text-[13px] font-semibold opacity-90"
              title={
                bannerTotal.unknownCount > 0
                  ? bannerTotal.unknownCount === 1
                    ? "1 logged entry has no unit cost set, so it is not included in this total."
                    : `${bannerTotal.unknownCount} logged entries have no unit cost set, so they are not included in this total.`
                  : undefined
              }
            >
              Total: {bannerTotalLabel}
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

// How long a press must last to count as "hold" and open the quantity sheet.
// Anything shorter is a plain tap (+1). 450ms sits between a deliberate tap
// and the OS long-press gestures this button suppresses.
const HOLD_OPEN_DELAY_MS = 450;

/**
 * A "+1"-style log button with a long-press: a tap logs 1 immediately, while
 * pressing and holding opens the quantity sheet (WasteQuantitySheet) where the
 * amount is typed or stepped and confirmed explicitly.
 *
 * Pointer-event details that matter:
 * - setPointerCapture on press so the release still lands here if the finger
 *   drifts slightly off the 44px target mid-press.
 * - When the hold timer fires, pointerIdRef is nulled BEFORE calling onHold:
 *   that consumes the press, so the pointerup that follows can't also log a
 *   tap. The click event after it carries detail >= 1 and is ignored too.
 * - pointercancel/lostpointercapture abandon the press: the browser takes the
 *   pointer when a touch turns into a scroll, and a scroll that merely
 *   started on this button must not log phantom waste.
 * - Keyboard/AT activation arrives as click with detail === 0 and logs 1; the
 *   sheet's quantities stay reachable via the "Log manually" form below.
 */
function HoldLogButton({
  ariaLabel,
  icon,
  className,
  disabled,
  showPending,
  onTap,
  onHold,
}: {
  ariaLabel: string;
  icon: ReactNode;
  className: string;
  disabled: boolean;
  showPending: boolean;
  onTap: () => void;
  onHold: () => void;
}) {
  const pointerIdRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The hold timer must not outlive the button (router.refresh() can swap the
  // grid out mid-press) -- and if the button is disabled mid-press (the card's
  // OTHER button just committed), the pointerup is swallowed (disabled
  // elements dispatch no pointer events), so the press is abandoned here
  // rather than left to wedge pointerIdRef forever.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
  useEffect(() => {
    if (!disabled) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pointerIdRef.current = null;
  }, [disabled]);

  function clearPress() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pointerIdRef.current = null;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (pointerIdRef.current !== null) return; // second finger on the same button: ignore
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture can be refused for an already-departed pointer; the press
      // still works as long as the release happens over the button.
    }
    pointerIdRef.current = event.pointerId;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      pointerIdRef.current = null; // consume the press: the coming pointerup must not tap
      onHold();
    }, HOLD_OPEN_DELAY_MS);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerId !== pointerIdRef.current) return;
    clearPress();
    onTap();
  }

  function handlePointerDiscard(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerId !== pointerIdRef.current) return;
    clearPress();
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerDiscard}
      onLostPointerCapture={handlePointerDiscard}
      onClick={(event) => {
        if (event.detail === 0) onTap();
      }}
      // Long-press must open the sheet, not the OS context menu / text
      // selection UI.
      onContextMenu={(event) => event.preventDefault()}
      aria-label={ariaLabel}
      className={`flex touch-manipulation select-none items-center justify-center gap-1 rounded-lg min-h-[44px] px-2 py-3 transition-opacity disabled:opacity-60 ${className}`}
    >
      <span className="text-[13px] font-bold">{showPending ? "..." : "+1"}</span>
      {icon}
    </button>
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
  const [sheetKind, setSheetKind] = useState<"trash" | "donate" | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  function log(
    kind: "trash" | "donate",
    quantity: number,
    extras?: { reason: string | null; note: string },
  ) {
    setError(null);
    setSheetError(null);
    setPendingKind(kind);
    const fromSheet = extras !== undefined;
    // The note carries disposition first ("Trash"/"Donated" -- what the
    // recent-entries list keys the heart/trash icon on), then the sheet's
    // optional reason chip and free-text note: "Donated · Expired · <note>".
    // Sliced to the logEntrySchema 500-char bound so a long note downgrades
    // gracefully instead of failing the whole log.
    const note = [kind === "donate" ? "Donated" : "Trash", extras?.reason, extras?.note]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 500);
    startTransition(async () => {
      const result = await safeAction(() =>
        logWasteEntry({ itemId: item.id, quantity, note }),
      );
      setPendingKind(null);
      if (!result.ok) {
        // The sheet stays open on failure so the typed count isn't lost.
        if (fromSheet) setSheetError(result.error);
        else setError(result.error);
        return;
      }
      setSheetKind(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-card p-3 shadow-card">
      <p className="truncate text-[15px] font-semibold text-ink">{item.name}</p>

      <div className="grid grid-cols-2 gap-2">
        <HoldLogButton
          ariaLabel={`Log ${item.name} to trash. Tap for 1, press and hold to pick a quantity.`}
          icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
          className="bg-danger-soft text-danger"
          disabled={isPending}
          showPending={isPending && pendingKind === "trash"}
          onTap={() => log("trash", 1)}
          onHold={() => setSheetKind("trash")}
        />
        <HoldLogButton
          ariaLabel={`Log ${item.name} donated. Tap for 1, press and hold to pick a quantity.`}
          icon={<Heart className="h-4 w-4" aria-hidden="true" />}
          className="bg-success-soft text-success"
          disabled={isPending}
          showPending={isPending && pendingKind === "donate"}
          onTap={() => log("donate", 1)}
          onHold={() => setSheetKind("donate")}
        />
      </div>

      {sheetKind !== null && (
        <WasteQuantitySheet
          kind={sheetKind}
          itemName={item.name}
          unit={item.unit}
          isPending={isPending}
          error={sheetError}
          onSubmit={({ quantity, reason, note }) => log(sheetKind, quantity, { reason, note })}
          onClose={() => {
            setSheetKind(null);
            setSheetError(null);
          }}
        />
      )}

      {/* Total QUANTITY, not entry count: one held press logs a single entry
          with quantity N, so "entries" would read as 1 after logging 12 and
          look like the hold didn't count. */}
      <p className="text-[12px] text-muted-ink">
        {rollup?.totalQuantity ?? 0} {item.unit} tracked
      </p>
      {/* No entries yet is a genuine $0.00; entries logged against an item with
          no unit cost is "—" (unknown), via the shared formatCentsAsUsd null
          convention -- never the misleading "$0.00" the old formatter showed. */}
      <p className="text-[13px] font-semibold text-ink">
        Total: {formatCentsAsUsd(rollup ? rollup.totalCostCents : 0)}
      </p>

      {error && <p className="text-[12px] leading-snug text-danger">{error}</p>}
    </div>
  );
}
