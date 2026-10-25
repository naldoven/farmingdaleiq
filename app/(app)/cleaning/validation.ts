import { z } from "zod";

import {
  CAPTURE_SOURCES,
  HALVES,
  INTERVAL_WEEKS,
  ITEM_KINDS,
  MARKUP_MAX_POINTS,
  MARKUP_MAX_STROKES,
  NAME_MAX,
  NOTE_MAX,
} from "@/app/(app)/cleaning/constants";

/**
 * Input validation for the Cleaning walkthrough route and master-list
 * actions (docs/CLEANING-PLAN.md "Phase W"). No "use server" so it is
 * testable on its own; client code imports constants.ts instead.
 *
 * The cadence rules here mirror the cleaning_items_cadence check constraint
 * so a bad combination fails with a friendly message before Postgres
 * rejects it with a raw one.
 */

const point = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);

export const markupSchema = z
  .object({
    strokes: z
      .array(z.object({ points: z.array(point).min(1) }))
      .max(MARKUP_MAX_STROKES, "That drawing has too many lines."),
  })
  .refine(
    (m) => m.strokes.reduce((sum, s) => sum + s.points.length, 0) <= MARKUP_MAX_POINTS,
    "That drawing is too detailed.",
  );

export type Markup = z.infer<typeof markupSchema>;

export const itemDetailsSchema = z
  .object({
    zoneId: z.string().uuid("Pick a zone"),
    name: z.string().trim().min(1, "Name the item").max(NAME_MAX),
    kind: z.enum(ITEM_KINDS, { message: "Pick constant or variable" }),
    daysOfWeek: z.array(z.number().int().min(1).max(6)).optional(),
    half: z.enum(HALVES, { message: "Pick AM, PM or Either" }),
    intervalWeeks: z
      .number()
      .int()
      .refine((n) => (INTERVAL_WEEKS as readonly number[]).includes(n), "Pick how many weeks")
      .optional(),
    ifNeeded: z.boolean().default(false),
    note: z.string().trim().max(NOTE_MAX).optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "constant") {
      if (!value.daysOfWeek || value.daysOfWeek.length === 0) {
        ctx.addIssue({ code: "custom", path: ["daysOfWeek"], message: "Pick at least one day" });
      }
      if (value.half === "either") {
        ctx.addIssue({ code: "custom", path: ["half"], message: "A constant is AM or PM" });
      }
    } else if (value.intervalWeeks === undefined) {
      ctx.addIssue({ code: "custom", path: ["intervalWeeks"], message: "Pick how many weeks" });
    }
  })
  .transform((value) => ({
    zone_id: value.zoneId,
    name: value.name,
    kind: value.kind,
    // Each kind stores only its own cadence field, matching the check
    // constraint; stale values from a toggled form are dropped here.
    days_of_week:
      value.kind === "constant" ? [...new Set(value.daysOfWeek ?? [])].sort((a, b) => a - b) : null,
    interval_weeks: value.kind === "variable" ? (value.intervalWeeks ?? null) : null,
    half: value.half,
    if_needed: value.ifNeeded,
    note: value.note ? value.note : null,
  }));

export type ItemDetailsInput = z.input<typeof itemDetailsSchema>;
export type ItemDetailsRow = z.output<typeof itemDetailsSchema>;

/**
 * One walkthrough save, posted as the JSON `payload` field beside the photo.
 * `photoId` is generated on the phone at the shutter and becomes the
 * cleaning_item_photos primary key (and the new item's id), so the same shot
 * sent twice can only ever land once.
 */
export const walkthroughSaveSchema = z.object({
  photoId: z.string().uuid(),
  capturedAt: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Bad capture time")
    .optional(),
  captureSource: z.enum(CAPTURE_SOURCES),
  markup: markupSchema.nullable().default(null),
  target: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("new"), details: itemDetailsSchema }),
    z.object({ mode: z.literal("existing"), itemId: z.string().uuid() }),
  ]),
});

export type WalkthroughSaveInput = z.input<typeof walkthroughSaveSchema>;
export type WalkthroughSave = z.output<typeof walkthroughSaveSchema>;

export const updateItemSchema = z.object({
  id: z.string().uuid(),
  details: itemDetailsSchema,
});

export const itemIdSchema = z.object({ id: z.string().uuid() });

// Weekly board (docs/CLEANING-PLAN.md "How a week runs") --------------------------

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Bad date")
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), "Bad date");

/** Mon to Sat only; Sunday is closed, mirroring cleaning_assignments_open_day. */
const openDate = isoDate.refine((v) => new Date(`${v}T00:00:00Z`).getUTCDay() !== 0, "The store is closed Sunday.");

const slotHalf = z.enum(["am", "pm"]);

export const SKIP_REASON_MAX = 200;
export const REJECT_NOTE_MAX = 300;

/** Multipart payload beside the photo on /api/cleaning/complete. */
export const completeSchema = z.object({
  assignmentId: z.string().uuid(),
  photoId: z.string().uuid(),
  notNeeded: z.boolean().default(false),
});

export const moveCleanSchema = z.object({
  id: z.string().uuid(),
  date: openDate,
  half: slotHalf,
});

export const skipCleanSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(1, "Give a reason for skipping.").max(SKIP_REASON_MAX),
});

export const addCleanSchema = z.object({
  itemId: z.string().uuid(),
  date: openDate,
  half: slotHalf,
});

export const rejectCleanSchema = z.object({
  id: z.string().uuid(),
  note: z.string().trim().min(1, "Say what needs redoing.").max(REJECT_NOTE_MAX),
});

export const weekStartSchema = z.object({
  weekStart: isoDate.refine((v) => new Date(`${v}T00:00:00Z`).getUTCDay() === 1, "Weeks start Monday."),
});

export const slotCapsSchema = z.object({
  caps: z
    .array(
      z.object({
        weekday: z.number().int().min(1).max(6),
        half: slotHalf,
        maxVariables: z.number().int().min(0).max(20),
      }),
    )
    .min(1)
    .max(12),
});

export const zoneActiveSchema = z.object({ id: z.string().uuid(), active: z.boolean() });

export const coordinatorSchema = z.object({ userId: z.string().uuid() });
