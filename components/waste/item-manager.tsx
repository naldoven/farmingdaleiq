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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createItem, deleteItem, updateItem } from "@/app/(app)/waste/actions";
import { WASTE_UNITS, type WasteUnit } from "@/app/(app)/waste/constants";

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
}: {
  item: ItemRow;
  categories: ItemCategoryOption[];
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
        <Input
          aria-label="Item name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="max-w-[12rem]"
        />
      </TableCell>
      <TableCell>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-[10rem]">
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
          inputMode="decimal"
          placeholder="$"
        />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await updateItem({
                  id: item.id,
                  name,
                  categoryId: categoryId === NO_CATEGORY ? null : categoryId,
                  unit,
                  unitCost: unitCost.trim() === "" ? null : Number(unitCost),
                });
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
                const result = await deleteItem({ id: item.id });
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

/** Admin CRUD for waste_items (PLAN.md S5: "admin CRUD"). */
export function ItemManager({
  items,
  categories,
}: {
  items: ItemRow[];
  categories: ItemCategoryOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(NO_CATEGORY);
  const [unit, setUnit] = useState<WasteUnit>("each");
  const [unitCost, setUnitCost] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Unit cost</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <ItemEditRow key={item.id} item={item} categories={categories} />
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No waste items yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createItem({
              name,
              categoryId: categoryId === NO_CATEGORY ? null : categoryId,
              unit,
              unitCost: unitCost.trim() === "" ? null : Number(unitCost),
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setName("");
            setCategoryId(NO_CATEGORY);
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
          <SelectTrigger className="w-[10rem]">
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
