"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteButton } from "@/components/checklists/delete-button";
import { createFoodItem, deleteFoodItem } from "@/app/(app)/checklists/templates/actions";

export interface FoodItemRow {
  id: string;
  name: string;
  coldMinF: number | null;
  coldMaxF: number | null;
  hotMinF: number | null;
  hotMaxF: number | null;
}

function toNumberOrUndefined(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Manages `food_items` (S1 owns this table per docs/agent-map.md): each item
 * carries a cold-holding and a hot-holding compliant range
 * (ARCHITECTURE.md "Checklists" -> food_items note), so a temperature
 * question can pick which mode applies.
 */
export function FoodItemsManager({ foodItems }: { foodItems: FoodItemRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [coldMin, setColdMin] = useState("");
  const [coldMax, setColdMax] = useState("");
  const [hotMin, setHotMin] = useState("");
  const [hotMax, setHotMax] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Cold holding (&deg;F)</TableHead>
            <TableHead>Hot holding (&deg;F)</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {foodItems.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {item.coldMinF ?? "—"} – {item.coldMaxF ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {item.hotMinF ?? "—"} – {item.hotMaxF ?? "—"}
              </TableCell>
              <TableCell>
                <DeleteButton id={item.id} action={deleteFoodItem} label="Remove" />
              </TableCell>
            </TableRow>
          ))}
          {foodItems.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No food items yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createFoodItem({
              name,
              coldMinF: toNumberOrUndefined(coldMin),
              coldMaxF: toNumberOrUndefined(coldMax),
              hotMinF: toNumberOrUndefined(hotMin),
              hotMaxF: toNumberOrUndefined(hotMax),
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setName("");
            setColdMin("");
            setColdMax("");
            setHotMin("");
            setHotMax("");
            router.refresh();
          });
        }}
      >
        <Input
          aria-label="Food item name"
          placeholder="Item name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-[10rem]"
          required
        />
        <Input
          aria-label="Cold min F"
          placeholder="Cold min"
          value={coldMin}
          onChange={(e) => setColdMin(e.target.value)}
          className="max-w-[6rem]"
          inputMode="numeric"
        />
        <Input
          aria-label="Cold max F"
          placeholder="Cold max"
          value={coldMax}
          onChange={(e) => setColdMax(e.target.value)}
          className="max-w-[6rem]"
          inputMode="numeric"
        />
        <Input
          aria-label="Hot min F"
          placeholder="Hot min"
          value={hotMin}
          onChange={(e) => setHotMin(e.target.value)}
          className="max-w-[6rem]"
          inputMode="numeric"
        />
        <Input
          aria-label="Hot max F"
          placeholder="Hot max"
          value={hotMax}
          onChange={(e) => setHotMax(e.target.value)}
          className="max-w-[6rem]"
          inputMode="numeric"
        />
        <Button type="submit" variant="secondary" disabled={isPending}>
          {isPending ? "Adding..." : "Add item"}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
