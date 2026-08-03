"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ChipRow, FilterChip } from "@/components/mobile";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createItem, deleteItem, reorderItems, updateItem } from "@/app/(app)/waste/actions";
import {
  WASTE_UNIT_COST_MAX,
  WASTE_UNITS,
  type WasteUnit,
} from "@/app/(app)/waste/constants";
import { safeAction } from "@/lib/errors/safe-action";

export interface ItemCategoryOption {
  id: string;
  name: string;
}

export interface ItemRow {
  id: string;
  name: string;
  categoryId: string | null;
  unit: WasteUnit;
  unitCost: number | null;
}

const NO_CATEGORY = "__none__";

function ItemEditRow({
  item,
  categories,
  onMoveUp,
  onMoveDown,
  reorderDisabled,
}: {
  item: ItemRow;
  categories: ItemCategoryOption[];
  /** Undefined when the item is already first in its category. */
  onMoveUp: (() => void) | undefined;
  /** Undefined when the item is already last in its category. */
  onMoveDown: (() => void) | undefined;
  reorderDisabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(item.name);
  const [categoryId, setCategoryId] = useState(item.categoryId ?? NO_CATEGORY);
  const [unit, setUnit] = useState<WasteUnit>(item.unit);
  const [unitCost, setUnitCost] = useState(item.unitCost != null ? String(item.unitCost) : "");
  const [error, setError] = useState<string | null>(null);

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={reorderDisabled || !onMoveUp}
            onClick={onMoveUp}
            aria-label={`Move ${item.name} up`}
          >
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={reorderDisabled || !onMoveDown}
            onClick={onMoveDown}
            aria-label={`Move ${item.name} down`}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </TableCell>
      <TableCell>
        <Input
          aria-label="Item name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="max-w-[12rem]"
        />
      </TableCell>
      <TableCell>
        <Select value={unit} onValueChange={(value) => setUnit(value as WasteUnit)}>
          <SelectTrigger className="w-[6rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WASTE_UNITS.map((unitOption) => (
              <SelectItem key={unitOption} value={unitOption}>
                {unitOption}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          aria-label="Unit cost"
          value={unitCost}
          onChange={(event) => setUnitCost(event.target.value)}
          className="max-w-[6rem]"
          type="number"
          min={0}
          max={WASTE_UNIT_COST_MAX}
          step="0.01"
          inputMode="decimal"
          placeholder="$"
        />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          {/* The category tabs above replace the old per-row Category COLUMN,
              but moving a mis-filed item still needs a control -- deleting and
              re-adding is refused once the item has waste logged against it
              (see deleteItem), so without this a wrongly categorized item
              would be stuck forever. Saving with a new category moves the item
              to that tab, appended at the end of its order (see updateItem). */}
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-[8.5rem]" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>No category</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() => {
              setError(null);
              // Parse the cost ONCE, explicitly. `Number("$2.50")` is NaN,
              // which zod rejects on TYPE, so the curated "can't be negative" /
              // max messages never fired and the user saw a generic type error
              // instead of anything actionable.
              const parsedUnitCost = unitCost.trim() === "" ? null : Number(unitCost);
              if (parsedUnitCost !== null && !Number.isFinite(parsedUnitCost)) {
                setError("Enter the unit cost as a number, e.g. 2.50");
                return;
              }
              startTransition(async () => {
                const result = await safeAction(() =>
                  updateItem({
                    id: item.id,
                    name,
                    categoryId: categoryId === NO_CATEGORY ? null : categoryId,
                    unit,
                    unitCost: parsedUnitCost,
                  }),
                );
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.refresh();
              });
            }}
          >
            {isPending ? "..." : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              if (!window.confirm(`Delete item "${item.name}"?`)) return;
              setError(null);
              startTransition(async () => {
                const result = await safeAction(() => deleteItem({ id: item.id }));
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.refresh();
              });
            }}
          >
            Delete
          </Button>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Admin CRUD for waste_items (PLAN.md S5: "admin CRUD"), organized the way the
 * log grid is used: a chip tab per category (plus a "No category" bucket only
 * when something is actually in it), and within a tab the rows show name /
 * unit / cost -- the category itself lives in the tab, not a per-row column.
 * The arrow buttons persist each item's position via reorderItems, which is
 * the order the /waste log grid shows the cards in.
 */
export function ItemManager({
  items,
  categories,
}: {
  items: ItemRow[];
  categories: ItemCategoryOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isReordering, startReorderTransition] = useTransition();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? NO_CATEGORY);
  const [unit, setUnit] = useState<WasteUnit>("each");
  const [unitCost, setUnitCost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const hasUncategorized = items.some((item) => item.categoryId === null);
  const tabKeys = [
    ...categories.map((category) => category.id),
    ...(hasUncategorized ? [NO_CATEGORY] : []),
  ];

  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  // Deleting the active category (or recategorizing the last uncategorized
  // item) removes its chip; fall back to the first remaining tab instead of
  // stranding the view on a tab that no longer exists.
  const activeTab =
    selectedTab !== null && tabKeys.includes(selectedTab)
      ? selectedTab
      : (tabKeys[0] ?? NO_CATEGORY);

  const visibleItems = items.filter((item) => (item.categoryId ?? NO_CATEGORY) === activeTab);
  const countByTab = new Map<string, number>();
  for (const item of items) {
    const key = item.categoryId ?? NO_CATEGORY;
    countByTab.set(key, (countByTab.get(key) ?? 0) + 1);
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= visibleItems.length) return;
    setReorderError(null);
    const next = [...visibleItems];
    const [row] = next.splice(index, 1);
    next.splice(target, 0, row);
    startReorderTransition(async () => {
      // The FULL ordered id list for this tab, not a pairwise swap: writing
      // sort = index for every row normalizes any stale/tied sort values in
      // the same pass (see reorderItems).
      const result = await safeAction(() =>
        reorderItems({ orderedIds: next.map((item) => item.id) }),
      );
      if (!result.ok) {
        setReorderError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ChipRow aria-label="Item categories">
        {categories.map((category) => (
          <FilterChip
            key={category.id}
            type="button"
            active={activeTab === category.id}
            activeColor="accent"
            onClick={() => {
              setSelectedTab(category.id);
              // New items usually belong to the category being looked at, so
              // the add form follows the tab (still overridable below).
              setCategoryId(category.id);
            }}
          >
            {category.name} ({countByTab.get(category.id) ?? 0})
          </FilterChip>
        ))}
        {hasUncategorized && (
          <FilterChip
            type="button"
            active={activeTab === NO_CATEGORY}
            activeColor="accent"
            onClick={() => {
              setSelectedTab(NO_CATEGORY);
              setCategoryId(NO_CATEGORY);
            }}
          >
            No category ({countByTab.get(NO_CATEGORY) ?? 0})
          </FilterChip>
        )}
      </ChipRow>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[5rem]">Order</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Unit cost</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleItems.map((item, index) => (
            <ItemEditRow
              key={item.id}
              item={item}
              categories={categories}
              onMoveUp={index > 0 ? () => move(index, -1) : undefined}
              onMoveDown={index < visibleItems.length - 1 ? () => move(index, 1) : undefined}
              reorderDisabled={isReordering}
            />
          ))}
          {visibleItems.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                {items.length === 0 ? "No waste items yet." : "No items in this category yet."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {reorderError && <p className="text-sm text-destructive">{reorderError}</p>}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          // Parse the cost ONCE, explicitly. `Number("$2.50")` is NaN,
          // which zod rejects on TYPE, so the curated "can't be negative" /
          // max messages never fired and the user saw a generic type error
          // instead of anything actionable.
          const parsedUnitCost = unitCost.trim() === "" ? null : Number(unitCost);
          if (parsedUnitCost !== null && !Number.isFinite(parsedUnitCost)) {
            setError("Enter the unit cost as a number, e.g. 2.50");
            return;
          }
          startTransition(async () => {
            const result = await safeAction(() =>
              createItem({
                name,
                categoryId: categoryId === NO_CATEGORY ? null : categoryId,
                unit,
                unitCost: parsedUnitCost,
              }),
            );
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setName("");
            setUnit("each");
            setUnitCost("");
            router.refresh();
          });
        }}
      >
        <Input
          aria-label="New item name"
          placeholder="Item name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="max-w-[12rem]"
          required
        />
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-[10rem]" aria-label="New item category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CATEGORY}>No category</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={unit} onValueChange={(value) => setUnit(value as WasteUnit)}>
          <SelectTrigger className="w-[6rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WASTE_UNITS.map((unitOption) => (
              <SelectItem key={unitOption} value={unitOption}>
                {unitOption}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label="Unit cost"
          placeholder="Unit cost"
          value={unitCost}
          onChange={(event) => setUnitCost(event.target.value)}
          className="max-w-[6rem]"
          type="number"
          min={0}
          max={WASTE_UNIT_COST_MAX}
          step="0.01"
          inputMode="decimal"
        />
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? "Adding..." : "Add item"}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
