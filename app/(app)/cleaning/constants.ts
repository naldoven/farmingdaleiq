/**
 * Zod-free constants for the Cleaning module (docs/CLEANING-PLAN.md). Client
 * components import from here, never from validation.ts, so zod stays out of
 * the browser bundle (see the 2026-07-08 bundle fix in AGENTS.md history).
 */

export const ITEM_KINDS = ["constant", "variable"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const HALVES = ["am", "pm", "either"] as const;
export type Half = (typeof HALVES)[number];

/** Constants are pinned to a half; only variables may say "either". */
export const CONSTANT_HALVES = ["am", "pm"] as const satisfies readonly Half[];

/**
 * Week counts a variable can repeat on. Planning is weekly, so cadences are
 * whole weeks: 4 stands in for "monthly" and 13 for "quarterly" (Naldo,
 * 2026-10-25). Mirrors the cleaning_items.interval_weeks check constraint.
 */
export const INTERVAL_WEEKS = [1, 2, 3, 4, 6, 8, 13] as const;
export type IntervalWeeks = (typeof INTERVAL_WEEKS)[number];

/**
 * Store weekdays, JS getDay numbering like task_templates. Sunday (0) is
 * missing on purpose: the store is closed.
 */
export const STORE_WEEKDAYS = [
  { value: 1, short: "Mon" },
  { value: 2, short: "Tue" },
  { value: 3, short: "Wed" },
  { value: 4, short: "Thu" },
  { value: 5, short: "Fri" },
  { value: 6, short: "Sat" },
] as const;

export const ITEM_STATUSES = ["draft", "active", "retired"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const CAPTURE_SOURCES = ["live", "file"] as const;
export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

export const NAME_MAX = 120;
export const NOTE_MAX = 500;

/** A found-and-fixed note is one line (cleaning_atd_finds.note check). */
export const FIND_NOTE_MAX = 200;

/** A drawing larger than this is a bug or abuse, not a circle on a vent. */
export const MARKUP_MAX_STROKES = 40;
export const MARKUP_MAX_POINTS = 4000;

/** Matches the cleaning-photos bucket limit, under Vercel's 4.5 MB body cap. */
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const PHOTO_BUCKET = "cleaning-photos";
