"use client";

import { useId, type ReactNode } from "react";

import {
  INTERVAL_WEEKS,
  NAME_MAX,
  NOTE_MAX,
  STORE_WEEKDAYS,
  type Half,
  type IntervalWeeks,
  type ItemKind,
} from "@/app/(app)/cleaning/constants";
// Type-only: the zod schema must never reach the browser bundle. The runtime
// check lives in validateItemDetails below, and a test pins it to the schema.
import type { ItemDetailsInput } from "@/app/(app)/cleaning/validation";
import { ChipRow, FilterChip } from "@/components/mobile";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * The item form shared by the master-list editor and the walkthrough camera
 * screen (docs/CLEANING-PLAN.md "Phase W"). Controlled and presentational: it
 * never saves, so each screen decides what "done" means.
 */
export interface ItemDetailsValue {
  zoneId: string;
  name: string;
  kind: ItemKind;
  daysOfWeek: number[];
  half: Half;
  intervalWeeks: number | null;
  ifNeeded: boolean;
  note: string;
}

export type ItemDetailsErrors = Partial<Record<keyof ItemDetailsValue, string>>;

export interface ItemDetailsZone {
  id: string;
  name: string;
  color: string;
  side: string;
}

export function emptyItemDetails(zoneId: string): ItemDetailsValue {
  return {
    zoneId,
    name: "",
    kind: "constant",
    daysOfWeek: [],
    half: "am",
    intervalWeeks: null,
    ifNeeded: false,
    note: "",
  };
}

/**
 * Maps the form value onto itemDetailsSchema's input. Empty cadence fields
 * become undefined (not null or []) because the schema treats "missing" as
 * "not chosen" and reports it with a friendly message.
 */
export function toItemDetailsInput(value: ItemDetailsValue): ItemDetailsInput {
  return {
    zoneId: value.zoneId,
    name: value.name,
    kind: value.kind,
    daysOfWeek: value.daysOfWeek.length > 0 ? value.daysOfWeek : undefined,
    half: value.half,
    intervalWeeks: value.intervalWeeks ?? undefined,
    ifNeeded: value.ifNeeded,
    note: value.note,
  };
}

/**
 * Field-level messages for the form, so a leader sees what is missing before
 * the round trip. Mirrors itemDetailsSchema (same wording); the server still
 * validates every save, this is only a convenience.
 */
export function validateItemDetails(value: ItemDetailsValue): ItemDetailsErrors {
  const errors: ItemDetailsErrors = {};
  if (!value.zoneId) errors.zoneId = "Pick a zone";
  if (value.name.trim().length === 0) errors.name = "Name the item";
  if (value.kind === "constant") {
    if (value.daysOfWeek.length === 0) errors.daysOfWeek = "Pick at least one day";
    if (value.half === "either") errors.half = "A constant is AM or PM";
  } else if (value.intervalWeeks === null) {
    errors.intervalWeeks = "Pick how many weeks";
  }
  return errors;
}

const INTERVAL_LABEL: Record<IntervalWeeks, string> = {
  1: "Every week",
  2: "2 wks",
  3: "3 wks",
  4: "4 wks (monthly)",
  6: "6 wks",
  8: "8 wks",
  13: "13 wks (quarterly)",
};

const HALF_LABEL: Record<Half, string> = { am: "AM", pm: "PM", either: "Either" };
const CONSTANT_HALF_CHOICES: Half[] = ["am", "pm"];
const VARIABLE_HALF_CHOICES: Half[] = ["am", "pm", "either"];

// ChipRow scrolls sideways by default. A form must show every choice at once,
// so these rows wrap instead of hiding chips off-screen.
const WRAP_ROW = "mx-0 flex-wrap overflow-visible px-0";
// FilterChip is a compact filter pill; form choices need a real tap target.
const TAP = "min-h-11 px-4 text-[14px] disabled:pointer-events-none disabled:opacity-50";

/** Keeps the original zone order (the caller passes them by sort), BOH first. */
function bohFirst(zones: ItemDetailsZone[]): ItemDetailsZone[] {
  const rank = (z: ItemDetailsZone) => (z.side === "boh" ? 0 : 1);
  return [...zones].sort((a, b) => rank(a) - rank(b));
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span id={id} className="text-[13px] font-semibold text-ink">
        {label}
      </span>
      {children}
      {error ? (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ItemDetailsFields({
  value,
  onChange,
  zones,
  errors,
  hideZone = false,
  disabled = false,
}: {
  value: ItemDetailsValue;
  onChange: (next: ItemDetailsValue) => void;
  zones: ItemDetailsZone[];
  errors?: ItemDetailsErrors;
  hideZone?: boolean;
  disabled?: boolean;
}) {
  const uid = useId();
  const ids = {
    zone: `${uid}-zone`,
    name: `${uid}-name`,
    kind: `${uid}-kind`,
    days: `${uid}-days`,
    interval: `${uid}-interval`,
    half: `${uid}-half`,
    note: `${uid}-note`,
  };

  function patch(change: Partial<ItemDetailsValue>) {
    onChange({ ...value, ...change });
  }

  function setKind(kind: ItemKind) {
    if (kind === value.kind) return;
    // A constant is pinned to a half, so "either" is not a valid carry-over.
    // The other kind's days or interval are kept: toggling back should not
    // lose a pick, and the schema drops whatever the chosen kind ignores.
    patch({ kind, half: kind === "constant" && value.half === "either" ? "am" : value.half });
  }

  function toggleDay(day: number) {
    const next = value.daysOfWeek.includes(day)
      ? value.daysOfWeek.filter((d) => d !== day)
      : [...value.daysOfWeek, day].sort((a, b) => a - b);
    patch({ daysOfWeek: next });
  }

  const halfChoices = value.kind === "constant" ? CONSTANT_HALF_CHOICES : VARIABLE_HALF_CHOICES;

  const halfField = (
    <Field id={ids.half} label="Time of day" error={errors?.half}>
      <ChipRow className={WRAP_ROW} role="group" aria-labelledby={ids.half}>
        {halfChoices.map((half) => (
          <FilterChip
            key={half}
            className={TAP}
            active={value.half === half}
            disabled={disabled}
            onClick={() => patch({ half })}
          >
            {HALF_LABEL[half]}
          </FilterChip>
        ))}
      </ChipRow>
    </Field>
  );

  return (
    <div className="flex flex-col gap-5">
      {hideZone ? null : (
        <Field id={ids.zone} label="Zone" error={errors?.zoneId}>
          <ChipRow className={WRAP_ROW} role="group" aria-labelledby={ids.zone}>
            {bohFirst(zones).map((zone) => (
              <FilterChip
                key={zone.id}
                className={cn(TAP, "gap-2")}
                active={value.zoneId === zone.id}
                disabled={disabled}
                onClick={() => patch({ zoneId: zone.id })}
              >
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full ring-1 ring-black/15"
                  style={{ backgroundColor: zone.color }}
                />
                {zone.name}
              </FilterChip>
            ))}
          </ChipRow>
        </Field>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.name} className="text-[13px] font-semibold text-ink">
          Name
        </label>
        <Input
          id={ids.name}
          value={value.name}
          disabled={disabled}
          maxLength={NAME_MAX}
          autoComplete="off"
          enterKeyHint="done"
          placeholder="What needs cleaning?"
          aria-invalid={errors?.name ? true : undefined}
          aria-describedby={errors?.name ? `${ids.name}-error` : undefined}
          // 16px: iOS Safari zooms the page when focusing a smaller input.
          className="h-12 text-base"
          onChange={(event) => patch({ name: event.target.value })}
        />
        {errors?.name ? (
          <p id={`${ids.name}-error`} role="alert" className="text-[13px] font-medium text-danger">
            {errors.name}
          </p>
        ) : null}
      </div>

      <Field id={ids.kind} label="How often">
        <div role="group" aria-labelledby={ids.kind} className="flex gap-2">
          <FilterChip
            className={cn(TAP, "flex-1 justify-center text-[15px]")}
            active={value.kind === "constant"}
            disabled={disabled}
            onClick={() => setKind("constant")}
          >
            Constant
          </FilterChip>
          <FilterChip
            className={cn(TAP, "flex-1 justify-center text-[15px]")}
            active={value.kind === "variable"}
            disabled={disabled}
            onClick={() => setKind("variable")}
          >
            Variable
          </FilterChip>
        </div>
        <p className="text-[13px] text-muted-ink">
          {value.kind === "constant"
            ? "Same day or days every week."
            : "Comes around every few weeks."}
        </p>
      </Field>

      {value.kind === "constant" ? (
        <>
          <Field id={ids.days} label="Days" error={errors?.daysOfWeek}>
            <ChipRow className={WRAP_ROW} role="group" aria-labelledby={ids.days}>
              {STORE_WEEKDAYS.map((day) => (
                <FilterChip
                  key={day.value}
                  className={TAP}
                  active={value.daysOfWeek.includes(day.value)}
                  disabled={disabled}
                  onClick={() => toggleDay(day.value)}
                >
                  {day.short}
                </FilterChip>
              ))}
            </ChipRow>
          </Field>
          {halfField}
        </>
      ) : (
        <>
          <Field id={ids.interval} label="Repeats" error={errors?.intervalWeeks}>
            <ChipRow className={WRAP_ROW} role="group" aria-labelledby={ids.interval}>
              {INTERVAL_WEEKS.map((weeks) => (
                <FilterChip
                  key={weeks}
                  className={TAP}
                  active={value.intervalWeeks === weeks}
                  disabled={disabled}
                  onClick={() => patch({ intervalWeeks: weeks })}
                >
                  {INTERVAL_LABEL[weeks]}
                </FilterChip>
              ))}
            </ChipRow>
          </Field>
          {halfField}
        </>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={value.ifNeeded}
        disabled={disabled}
        onClick={() => patch({ ifNeeded: !value.ifNeeded })}
        className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3 text-left disabled:pointer-events-none disabled:opacity-50"
      >
        <span className="flex flex-col">
          <span className="text-[15px] font-semibold text-ink">If needed</span>
          <span className="text-[13px] text-muted-ink">
            Can be marked &apos;checked, not needed&apos;
          </span>
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full transition-colors",
            value.ifNeeded ? "bg-accent" : "bg-muted-ink/40",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all",
              value.ifNeeded ? "left-[22px]" : "left-0.5",
            )}
          />
        </span>
      </button>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.note} className="text-[13px] font-semibold text-ink">
          Note <span className="font-normal text-muted-ink">(optional)</span>
        </label>
        <Textarea
          id={ids.note}
          value={value.note}
          disabled={disabled}
          maxLength={NOTE_MAX}
          rows={2}
          // 16px for the same iOS zoom reason as the name field.
          className="text-base"
          onChange={(event) => patch({ note: event.target.value })}
        />
      </div>
    </div>
  );
}
