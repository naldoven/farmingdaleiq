"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChipRow, FilterChip } from "@/components/mobile";
import {
  WASTE_QUANTITY_MAX,
  WASTE_REASONS,
  type WasteUnit,
} from "@/app/(app)/waste/constants";

// Stepper auto-repeat: one step lands immediately on press, and holding keeps
// stepping after a short delay -- the same feel as a native number stepper.
const STEP_HOLD_DELAY_MS = 400;
const STEP_REPEAT_MS = 110;

/**
 * A round -/+ button that steps once per tap and auto-repeats while held.
 * Deliberately NEVER disabled at the count's bounds: the sheet clamps in
 * `adjust` instead. Disabling a button mid-hold would swallow its pointerup
 * (disabled elements dispatch no pointer events), leaving the repeat timer
 * running forever -- clamping makes the bound a no-op rather than a wedge.
 * Keyboard/AT activation arrives as click with detail === 0 and steps once;
 * pointer-driven clicks (detail >= 1) already stepped on pointerdown.
 */
function StepperButton({
  label,
  icon,
  disabled,
  onStep,
}: {
  label: string;
  icon: React.ReactNode;
  disabled: boolean;
  onStep: () => void;
}) {
  const pointerIdRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest onStep, so a repeat timer started several renders ago never
  // steps through a stale closure.
  const onStepRef = useRef(onStep);
  useEffect(() => {
    onStepRef.current = onStep;
  }, [onStep]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function stop() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pointerIdRef.current = null;
  }

  function repeat() {
    onStepRef.current();
    timerRef.current = setTimeout(repeat, STEP_REPEAT_MS);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (pointerIdRef.current !== null) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture can be refused for an already-departed pointer; holding still
      // works while the pointer stays over the button.
    }
    pointerIdRef.current = event.pointerId;
    onStepRef.current();
    timerRef.current = setTimeout(repeat, STEP_HOLD_DELAY_MS);
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerId !== pointerIdRef.current) return;
    stop();
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
      onClick={(event) => {
        if (event.detail === 0) onStepRef.current();
      }}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={label}
      className="flex h-12 w-12 shrink-0 touch-manipulation select-none items-center justify-center rounded-full bg-secondary text-ink transition-opacity active:opacity-70 disabled:opacity-40"
    >
      {icon}
    </button>
  );
}

export interface QuantitySheetSubmit {
  quantity: number;
  reason: string | null;
  note: string;
}

/**
 * KitchenIQ-style quantity picker, opened by press-and-holding a card button
 * in the waste log grid (components/waste/waste-log-grid.tsx). Styled as a
 * bottom sheet on phones (where logging happens) and a centered dialog on
 * desktop. Count starts at 0 and can be typed directly or stepped with the
 * -/+ buttons; an optional reason chip and note ride along in the entry's
 * note field. Nothing is logged until the confirm button -- closing the sheet
 * abandons the count, which is the overshoot escape hatch the ramp-style
 * hold counter this replaces never had.
 *
 * Mounted only while open (the parent conditions on its sheet state), so
 * every open starts from a clean count/reason/note.
 */
export function WasteQuantitySheet({
  kind,
  itemName,
  unit,
  isPending,
  error,
  onSubmit,
  onClose,
}: {
  kind: "trash" | "donate";
  itemName: string;
  unit: WasteUnit;
  isPending: boolean;
  error: string | null;
  onSubmit: (payload: QuantitySheetSubmit) => void;
  onClose: () => void;
}) {
  const [count, setCount] = useState("0");
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);

  const parsedCount = Number(count);
  const isValid =
    Number.isFinite(parsedCount) && parsedCount > 0 && parsedCount <= WASTE_QUANTITY_MAX;

  function adjust(delta: number) {
    // Functional update: the stepper's auto-repeat fires from a timer, so
    // deriving from `count` in this closure would step from a stale value.
    setCount((current) => {
      const base = Number(current);
      const next = (Number.isFinite(base) ? base : 0) + delta;
      const clamped = Math.min(WASTE_QUANTITY_MAX, Math.max(0, next));
      // toFixed strips float noise when stepping a typed decimal (2.5 + 1);
      // Number() then drops trailing zeros so "each" counts stay "3", not "3.00".
      return String(Number(clamped.toFixed(2)));
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        // Bottom sheet on phones, standard centered dialog from sm: up. The
        // base component centers with left-1/2/top-1/2 + translate; all four
        // are overridden here and restored at sm:.
        className="bottom-0 left-0 right-0 top-auto w-full max-w-none translate-x-0 translate-y-0 rounded-b-none rounded-t-2xl data-[state=closed]:slide-out-to-bottom-8 data-[state=open]:slide-in-from-bottom-8 sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
      >
        <DialogHeader>
          <DialogTitle>{kind === "donate" ? "Donation" : "Trash"}</DialogTitle>
          <DialogDescription className="text-[15px] font-semibold text-ink">
            {itemName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-5 py-2">
          <StepperButton
            label="Decrease quantity"
            icon={<Minus className="h-5 w-5" aria-hidden="true" />}
            disabled={isPending}
            onStep={() => adjust(-1)}
          />
          <div className="flex flex-col items-center gap-1">
            <Input
              aria-label="Quantity"
              value={count}
              onChange={(event) => setCount(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              type="number"
              min={0}
              max={WASTE_QUANTITY_MAX}
              step={unit === "each" ? "1" : "0.01"}
              inputMode={unit === "each" ? "numeric" : "decimal"}
              className="h-16 w-28 rounded-xl border-line text-center !text-3xl font-bold"
            />
            <span className="text-[12px] font-medium text-muted-ink">{unit}</span>
          </div>
          <StepperButton
            label="Increase quantity"
            icon={<Plus className="h-5 w-5" aria-hidden="true" />}
            disabled={isPending}
            onStep={() => adjust(1)}
          />
        </div>

        {/* Single-select, tap-again-to-clear: a reason is helpful context, not
            a required field -- requiring one would slow down the fast path
            this grid exists for. */}
        <ChipRow aria-label="Waste reason">
          {WASTE_REASONS.map((reasonOption) => (
            <FilterChip
              key={reasonOption}
              type="button"
              active={reason === reasonOption}
              onClick={() => setReason(reason === reasonOption ? null : reasonOption)}
            >
              {reasonOption}
            </FilterChip>
          ))}
        </ChipRow>

        {showNote ? (
          <Textarea
            aria-label="Note"
            placeholder="Note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={400}
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="flex items-center gap-2 self-start text-[13px] font-semibold text-muted-ink"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            Notes
          </button>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="button"
          className="w-full"
          disabled={!isValid || isPending}
          onClick={() => onSubmit({ quantity: parsedCount, reason, note: note.trim() })}
        >
          {isPending
            ? "Logging..."
            : kind === "donate"
              ? "Add donation"
              : "Add to trash"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
