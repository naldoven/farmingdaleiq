"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";

import { filterPullItems, type PullItem } from "@/app/(app)/cleaning/board-view";
import { addClean } from "@/app/(app)/cleaning/week-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ZoneDot } from "@/components/cleaning/week-card";

type Half = "am" | "pm";

/** More than this and the list is a wall; the search box is how you reach the rest. */
const SHOWN = 40;

/**
 * "Pull from master list" (plan "How a week runs" step 2): a searchable
 * picker of active items in active zones that adds the chosen item to the
 * selected day, in the half the planner taps. It stays open after an add so
 * several items can go in one visit; the board behind it reloads each time.
 * Adding past a slot's cap is allowed (the planner's override), the board
 * shows that slot as over.
 */
export function WeekPullPicker({
  items,
  onBoardIds,
  date,
  dayLabel,
  past,
  onClose,
  onAdded,
}: {
  items: PullItem[];
  /** Items already on this week's board, flagged so a duplicate is a choice, not an accident. */
  onBoardIds: string[];
  date: string;
  dayLabel: string;
  /** The selected day already ended; nothing can be added to it. */
  past: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const onBoard = useMemo(() => new Set(onBoardIds), [onBoardIds]);
  const matches = useMemo(() => filterPullItems(items, query), [items, query]);
  const shown = matches.slice(0, SHOWN);

  async function add(item: PullItem, half: Half) {
    const key = `${item.id}|${half}`;
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      const result = await addClean({ itemId: item.id, date, half });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAdded((current) => new Set(current).add(key));
      onAdded();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="bottom-0 left-0 right-0 top-auto flex h-[85svh] max-h-[85svh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-3 rounded-b-none rounded-t-2xl data-[state=closed]:slide-out-to-bottom-8 data-[state=open]:slide-in-from-bottom-8 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:h-[70svh] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl">
        <DialogHeader>
          <DialogTitle className="pr-6 text-[19px]">Pull from master list</DialogTitle>
          <DialogDescription className="text-[14px]">Adds to {dayLabel}. Pick AM or PM on the item.</DialogDescription>
        </DialogHeader>

        <label className="flex items-center gap-2 rounded-lg border border-line bg-card px-3">
          <Search className="h-4 w-4 text-muted-ink" aria-hidden="true" />
          <span className="sr-only">Search items</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by item or zone"
            className="h-12 flex-1 bg-transparent text-[16px] outline-none"
          />
        </label>

        {past ? (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-[14px] text-ink">
            {dayLabel} has passed. Pick a day from today on.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-[14px] font-medium text-danger">
            {error}
          </p>
        ) : null}

        <ul className="-mx-6 flex-1 divide-y divide-line overflow-y-auto border-t border-line">
          {shown.length === 0 ? (
            <li className="px-6 py-4 text-[14px] text-muted-ink">No items match.</li>
          ) : null}
          {shown.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-6 py-3">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="break-words text-[15px] font-semibold text-ink">{item.name}</span>
                <span className="flex items-center gap-2 text-[13px] text-muted-ink">
                  <ZoneDot color={item.zoneColor} />
                  {item.zoneName} · {item.cadence}
                </span>
                {onBoard.has(item.id) ? (
                  <span className="text-[12px] font-medium text-accent-ink">Already on this week&apos;s board</span>
                ) : null}
              </span>
              <span className="flex shrink-0 gap-1.5">
                {(["am", "pm"] as const).map((half) => {
                  const key = `${item.id}|${half}`;
                  const done = added.has(key);
                  return (
                    <Button
                      key={half}
                      variant={item.half === half ? "default" : "outline"}
                      className="h-11 min-w-[56px] rounded-lg px-3 text-[14px]"
                      aria-label={`Add ${item.name} to ${dayLabel} ${half.toUpperCase()}`}
                      disabled={past || busy !== null || done}
                      onClick={() => add(item, half)}
                    >
                      {done ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                      {half.toUpperCase()}
                    </Button>
                  );
                })}
              </span>
            </li>
          ))}
        </ul>
        {matches.length > shown.length ? (
          <p className="text-[13px] text-muted-ink">
            Showing {shown.length} of {matches.length}. Type to narrow the list.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
