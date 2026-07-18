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
import { Textarea } from "@/components/ui/textarea";
import { logWasteEntry } from "@/app/(app)/waste/actions";
import { WASTE_QUANTITY_MAX } from "@/app/(app)/waste/constants";

export interface LogFormItemOption {
  id: string;
  name: string;
  unit: string;
}

export interface LogFormDayPartOption {
  id: string;
  name: string;
}

const NO_DAY_PART = "__none__";

/**
 * Fast, mobile-first waste logging (PLAN.md S5: "fast mobile logging (item,
 * quantity, count or weight)"). One screen, no navigation: pick item, enter
 * quantity in that item's unit, optionally tag a day part and a note.
 * Submit disables itself for the duration of the request (see
 * app/(app)/waste/actions.ts logWasteEntry doc comment for why that's the
 * right double-submit guard here instead of server-side dedup).
 */
export function LogEntryForm({
  items,
  dayParts,
}: {
  items: LogFormItemOption[];
  dayParts: LogFormDayPartOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [dayPartId, setDayPartId] = useState(NO_DAY_PART);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedItem = items.find((item) => item.id === itemId);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!itemId) {
          setError("Pick an item first.");
          return;
        }
        setError(null);
        startTransition(async () => {
          const result = await logWasteEntry({
            itemId,
            quantity: Number(quantity),
            dayPartId: dayPartId === NO_DAY_PART ? null : dayPartId,
            note,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setQuantity("");
          setNote("");
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="waste-log-item">
          Item
        </label>
        <Select value={itemId} onValueChange={setItemId} disabled={items.length === 0}>
          <SelectTrigger id="waste-log-item">
            <SelectValue placeholder="Pick an item" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No waste items set up yet. Ask a manager to add some in Admin.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="waste-log-quantity">
          Quantity{selectedItem ? ` (${selectedItem.unit})` : ""}
        </label>
        <Input
          id="waste-log-quantity"
          type="number"
          min="0"
          max={WASTE_QUANTITY_MAX}
          step="0.01"
          inputMode="decimal"
          required
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="waste-log-day-part">
          Day part
        </label>
        <Select value={dayPartId} onValueChange={setDayPartId}>
          <SelectTrigger id="waste-log-day-part">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_DAY_PART}>Not specified</SelectItem>
            {dayParts.map((dayPart) => (
              <SelectItem key={dayPart.id} value={dayPart.id}>
                {dayPart.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="waste-log-note">
          Note (optional)
        </label>
        <Textarea
          id="waste-log-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending || !itemId}>
        {isPending ? "Logging..." : "Log waste"}
      </Button>
    </form>
  );
}
