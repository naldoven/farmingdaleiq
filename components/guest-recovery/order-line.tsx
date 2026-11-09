"use client";

import { useId, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { MAX_QTY, MOD_NOTE_MAX, FAULT_LABELS } from "@/app/(app)/guest-recovery/constants";
import type { MenuItemView } from "@/app/(app)/guest-recovery/types";
import { deriveFaultSource, formatMods, hasMods } from "@/lib/guest-recovery/mods";
import { cn } from "@/lib/utils";

/**
 * One line of the order on the log form: the item, how many, and for an item
 * that takes changes, tap-to-remove ingredient chips, add-on chips and a short
 * note. When the guest got something wrong (a change or a wrong item), the two
 * receipt questions show too, and the likely cause is worked out from them.
 * Two lines of the same item stay separate so each keeps its own changes.
 */

export interface OrderLine {
  key: string;
  menuItemId: string;
  qty: number;
  removed: string[];
  added: string[];
  modNote: string;
  receiptOk: boolean | null;
  itemOk: boolean | null;
}

export function newLine(menuItemId: string): OrderLine {
  return {
    key: crypto.randomUUID(),
    menuItemId,
    qty: 1,
    removed: [],
    added: [],
    modNote: "",
    receiptOk: null,
    itemOk: null,
  };
}

export function Stepper({
  qty,
  label,
  onChange,
}: {
  qty: number;
  label: string;
  onChange: (qty: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Fewer ${label}`}
        onClick={() => onChange(qty - 1)}
        className="flex size-11 items-center justify-center rounded-lg border border-border text-ink"
      >
        <Minus className="size-4" />
      </button>
      <span className="w-6 text-center text-base font-bold tabular-nums" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        aria-label={`More ${label}`}
        disabled={qty >= MAX_QTY}
        onClick={() => onChange(qty + 1)}
        className="flex size-11 items-center justify-center rounded-lg border border-border text-ink disabled:opacity-40"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

/**
 * The receipt questions are asked when the line carries changes, or when the
 * guest called about a wrong item. A missing item or a slow order has nothing
 * to trace, so those logs stay as quick as before.
 */
export function faultAsked(line: OrderLine, reason: string | null): boolean {
  return reason === "wrong_item" || hasMods({ removed: line.removed, added: line.added, note: line.modNote });
}

function toggled(list: string[], name: string): string[] {
  return list.includes(name) ? list.filter((n) => n !== name) : [...list, name];
}

function YesNo({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <div role="radiogroup" aria-label={legend} className="space-y-1">
      <p className="text-[14px] font-semibold text-ink">{legend}</p>
      <div className="flex gap-2">
        {(
          [
            ["Yes", true],
            ["No", false],
            ["Not sure", null],
          ] as const
        ).map(([text, answer]) => (
          <button
            key={text}
            type="button"
            role="radio"
            aria-checked={value === answer}
            onClick={() => onChange(answer)}
            className={cn(
              "min-h-11 flex-1 rounded-lg border px-2 text-[14px] font-semibold",
              value === answer ? "border-accent bg-accent text-white" : "border-border bg-card text-ink",
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function OrderLineCard({
  line,
  item,
  reason,
  onChange,
}: {
  line: OrderLine;
  item: MenuItemView;
  /** Why the guest called; decides whether the receipt questions show (see faultAsked). */
  reason: string | null;
  /** A qty of 0 or less means the leader removed the line. */
  onChange: (next: OrderLine | null) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(line.removed.length > 0 || line.added.length > 0 || line.modNote !== "");
  const mods = formatMods({ removed: line.removed, added: line.added, note: line.modNote });
  const showFault = faultAsked(line, reason);
  const cause = showFault && (line.receiptOk !== null || line.itemOk !== null)
    ? FAULT_LABELS[deriveFaultSource(line.receiptOk, line.itemOk)]
    : null;

  return (
    <li className="space-y-2 rounded-lg border border-line bg-accent-soft px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{item.name}</p>
          {mods && <p className="text-[13px] font-semibold text-accent-ink">{mods}</p>}
        </div>
        <Stepper
          qty={line.qty}
          label={item.name}
          onChange={(qty) => onChange(qty <= 0 ? null : { ...line, qty: Math.min(qty, MAX_QTY) })}
        />
      </div>

      {item.modifiable && (
        <div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-ink"
          >
            {open ? "Hide changes" : "Changes (no pickles, extra sauce...)"}
          </button>
          {open && (
            <div className="mt-2 space-y-3">
              {item.ingredients.length > 0 && (
                <div>
                  <p className="mb-1 text-[13px] text-muted-ink">Tap to take off</p>
                  <div className="flex flex-wrap gap-2">
                    {item.ingredients.map((name) => {
                      const off = line.removed.includes(name);
                      return (
                        <button
                          key={name}
                          type="button"
                          aria-pressed={off}
                          onClick={() => onChange({ ...line, removed: toggled(line.removed, name) })}
                          className={cn(
                            "inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-[14px] font-semibold",
                            off ? "border-danger bg-danger text-white" : "border-border bg-card text-ink",
                          )}
                        >
                          {off && <Minus className="size-3.5" aria-hidden="true" />}
                          {off ? `No ${name.toLowerCase()}` : name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {item.addons.length > 0 && (
                <div>
                  <p className="mb-1 text-[13px] text-muted-ink">Tap to add or swap</p>
                  <div className="flex flex-wrap gap-2">
                    {item.addons.map((name) => {
                      const on = line.added.includes(name);
                      return (
                        <button
                          key={name}
                          type="button"
                          aria-pressed={on}
                          onClick={() => onChange({ ...line, added: toggled(line.added, name) })}
                          className={cn(
                            "inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-[14px] font-semibold",
                            on ? "border-accent bg-accent text-white" : "border-border bg-card text-ink",
                          )}
                        >
                          {on && <Plus className="size-3.5" aria-hidden="true" />}
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <label htmlFor={`${id}-note`} className="mb-1 block text-[13px] text-muted-ink">
                  Something else (optional)
                </label>
                <input
                  id={`${id}-note`}
                  className="min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-ink"
                  value={line.modNote}
                  maxLength={MOD_NOTE_MAX}
                  autoComplete="off"
                  onChange={(e) => onChange({ ...line, modNote: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {showFault && (
        <div className="space-y-2 rounded-lg bg-card p-2">
          <YesNo
            legend="Did the receipt or sticker show what the guest ordered?"
            value={line.receiptOk}
            onChange={(receiptOk) => onChange({ ...line, receiptOk })}
          />
          <YesNo
            legend="Did the item in the box match the sticker?"
            value={line.itemOk}
            onChange={(itemOk) => onChange({ ...line, itemOk })}
          />
          {cause && <p className="text-[13px] font-semibold text-ink">Likely cause: {cause}</p>}
        </div>
      )}
    </li>
  );
}
