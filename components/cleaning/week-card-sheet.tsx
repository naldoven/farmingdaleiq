"use client";

import { useState, useTransition } from "react";

import type { ActionResult } from "@/app/(app)/cleaning/action-types";
import {
  isMovable,
  isPastDay,
  isRemovable,
  isRestorable,
  weekDays,
  type BoardCard,
} from "@/app/(app)/cleaning/board-view";
import { moveClean, removeClean, skipClean, unskipClean } from "@/app/(app)/cleaning/week-actions";
import { ChipRow, FilterChip } from "@/components/mobile";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type Mode = "move" | "skip" | "remove" | null;

/** Same as SKIP_REASON_MAX in validation.ts, kept here so zod stays out of the browser bundle. */
const REASON_MAX = 200;

/**
 * What a planner can do with one card (plan "How a week runs" step 2): move
 * it to another day or half, skip it with a reason, or remove a pulled-in
 * extra. A skipped card offers the one undo. The server actions re-check
 * planning rights and filter on status, so a double tap here is harmless; the
 * disabled states are for feedback.
 *
 * Opens as a bottom sheet on phones, a centered dialog from sm: up, like the
 * waste quantity sheet. Past days are disabled because a clean left on a day
 * that has ended is closed out as a miss.
 */
export function WeekCardSheet({
  card,
  weekStart,
  today,
  onClose,
  onChanged,
}: {
  card: BoardCard;
  weekStart: string;
  today: string;
  onClose: () => void;
  /** Called after an action succeeds: the board closes the sheet and reloads. */
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [date, setDate] = useState(card.date);
  const [half, setHalf] = useState(card.half);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onChanged();
    });
  }

  function choose(next: Mode) {
    setMode(next);
    setError(null);
  }

  const unchanged = date === card.date && half === card.half;
  const trimmedReason = reason.trim();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="bottom-0 left-0 right-0 top-auto max-h-[90svh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-b-none rounded-t-2xl pb-[max(env(safe-area-inset-bottom),24px)] data-[state=closed]:slide-out-to-bottom-8 data-[state=open]:slide-in-from-bottom-8 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl">
        <DialogHeader>
          <DialogTitle className="pr-6 text-[19px] leading-snug">{card.name}</DialogTitle>
          <DialogDescription className="text-[14px]">
            {card.zoneName} zone, {card.half.toUpperCase()}
          </DialogDescription>
        </DialogHeader>

        {isRestorable(card) ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-[14px] text-ink">
              Skipped{card.skipReason ? `: ${card.skipReason}` : ""}. It stays overdue: the next build places it
              first, or add it back from the tray.
            </p>
            <Button
              className="h-12 w-full rounded-lg text-[16px]"
              disabled={pending || isPastDay(card.date, today)}
              onClick={() => run(() => unskipClean({ id: card.id }))}
            >
              {pending ? "Working..." : "Put back on the plan"}
            </Button>
            {isPastDay(card.date, today) ? (
              <p className="text-[13px] text-muted-ink">That day has passed, so it can&apos;t go back on the plan.</p>
            ) : null}
          </div>
        ) : null}

        {isMovable(card) && mode === null && card.date <= today ? (
          <p className="text-[14px] text-muted-ink">
            Today&apos;s cleans stay on today&apos;s list. Only a later day&apos;s clean can be moved, skipped or removed.
          </p>
        ) : null}

        {isMovable(card) && mode === null && card.date > today ? (
          <div className="flex flex-col gap-2">
            <Button variant="outline" className="h-12 w-full rounded-lg text-[16px]" onClick={() => choose("move")}>
              Move to another day or half
            </Button>
            <Button variant="outline" className="h-12 w-full rounded-lg text-[16px]" onClick={() => choose("skip")}>
              Skip it
            </Button>
            {isRemovable(card) ? (
              <Button
                variant="outline"
                className="h-12 w-full rounded-lg border-danger/40 text-[16px] text-danger hover:bg-danger-soft hover:text-danger"
                onClick={() => choose("remove")}
              >
                Remove from this day
              </Button>
            ) : (
              <p className="text-[13px] text-muted-ink">A constant can&apos;t be removed. Skip it instead.</p>
            )}
          </div>
        ) : null}

        {mode === "move" ? (
          <div className="flex flex-col gap-3">
            <ChipRow role="group" aria-label="Day" className="flex-wrap">
              {weekDays(weekStart).map((day) => (
                <FilterChip
                  key={day.date}
                  className="min-h-11 px-4 text-[14px] disabled:pointer-events-none disabled:opacity-40"
                  active={date === day.date}
                  activeColor="accent"
                  disabled={isPastDay(day.date, today)}
                  onClick={() => setDate(day.date)}
                >
                  {day.short} {day.dayOfMonth}
                </FilterChip>
              ))}
            </ChipRow>
            <ChipRow role="group" aria-label="Half of the day">
              {(["am", "pm"] as const).map((value) => (
                <FilterChip
                  key={value}
                  className="min-h-11 px-6 text-[14px]"
                  active={half === value}
                  activeColor="accent"
                  onClick={() => setHalf(value)}
                >
                  {value.toUpperCase()}
                </FilterChip>
              ))}
            </ChipRow>
            <div className="flex gap-2">
              <Button
                className="h-12 flex-1 rounded-lg text-[16px]"
                disabled={pending || unchanged || isPastDay(date, today)}
                onClick={() => run(() => moveClean({ id: card.id, date, half }))}
              >
                {pending ? "Moving..." : "Move here"}
              </Button>
              <Button
                variant="outline"
                className="h-12 rounded-lg px-5 text-[16px]"
                disabled={pending}
                onClick={() => choose(null)}
              >
                Back
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "skip" ? (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] text-muted-ink">
              Not a miss. The item stays overdue: the next build places it first, or add it back from the tray.
            </p>
            <Textarea
              aria-label="Reason for skipping"
              placeholder="Why is it being skipped?"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={REASON_MAX}
              rows={3}
              className="text-[16px]"
            />
            <p className="-mt-2 text-right text-[12px] text-muted-ink">
              {reason.length}/{REASON_MAX}
            </p>
            <div className="flex gap-2">
              <Button
                className="h-12 flex-1 rounded-lg text-[16px]"
                disabled={pending || trimmedReason.length === 0}
                onClick={() => run(() => skipClean({ id: card.id, reason: trimmedReason }))}
              >
                {pending ? "Skipping..." : "Skip it"}
              </Button>
              <Button
                variant="outline"
                className="h-12 rounded-lg px-5 text-[16px]"
                disabled={pending}
                onClick={() => choose(null)}
              >
                Back
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "remove" ? (
          <div className="flex flex-col gap-3">
            <p className="text-[15px] font-medium text-ink">
              Remove this clean from the board? The item stays on the master list.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                className="h-12 flex-1 rounded-lg text-[16px]"
                disabled={pending}
                onClick={() => run(() => removeClean({ id: card.id }))}
              >
                {pending ? "Removing..." : "Yes, remove"}
              </Button>
              <Button
                variant="outline"
                className="h-12 flex-1 rounded-lg text-[16px]"
                disabled={pending}
                onClick={() => choose(null)}
              >
                Keep it
              </Button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-[14px] font-medium text-danger">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
