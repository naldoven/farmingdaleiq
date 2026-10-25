/**
 * Pure pieces of the walkthrough camera (docs/CLEANING-PLAN.md "Phase W"):
 * the per-photo form kept on the phone, its checks, and the payload the
 * route receives. No React, no zod, so it is cheap in the client bundle and
 * tested without a browser.
 *
 * The phone stores the FORM, not the server payload, in its queue: a shot
 * the server refuses (bad details) can be reopened, fixed and resent, and a
 * restored queue rebuilds the payload with today's rules.
 */

import type { CaptureSource } from "@/app/(app)/cleaning/constants";
import type { MarkupData } from "@/app/(app)/cleaning/logic";
import type { WalkthroughSaveInput } from "@/app/(app)/cleaning/validation";
import { toItemDetailsInput, type ItemDetailsValue } from "@/components/cleaning/item-details-fields";

export interface ShotForm {
  mode: "new" | "existing";
  details: ItemDetailsValue;
  existingItemId: string | null;
  existingItemName: string | null;
  markup: MarkupData | null;
  captureSource: CaptureSource;
}

export type ShotFormErrors = Partial<Record<keyof ItemDetailsValue | "existingItemId", string>>;

/**
 * The same rules the server's itemDetailsSchema applies, checked on the
 * phone so a leader fixes a missing day before walking away, not after the
 * upload is refused.
 */
export function validateShotForm(form: ShotForm): ShotFormErrors {
  if (form.mode === "existing") {
    return form.existingItemId ? {} : { existingItemId: "Pick the item this photo shows" };
  }
  const errors: ShotFormErrors = {};
  const d = form.details;
  if (!d.zoneId) errors.zoneId = "Pick a zone";
  if (!d.name.trim()) errors.name = "Name the item";
  if (d.kind === "constant") {
    if (d.daysOfWeek.length === 0) errors.daysOfWeek = "Pick at least one day";
    if (d.half === "either") errors.half = "A constant is AM or PM";
  } else if (d.intervalWeeks === null) {
    errors.intervalWeeks = "Pick how many weeks";
  }
  return errors;
}

export function hasErrors(errors: ShotFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Empty drawings are sent as no drawing at all. */
function cleanMarkup(markup: MarkupData | null): MarkupData | null {
  if (!markup) return null;
  const strokes = markup.strokes.filter((s) => s.points.length > 0);
  return strokes.length > 0 ? { strokes } : null;
}

export function buildSavePayload(photoId: string, capturedAt: string, form: ShotForm): WalkthroughSaveInput {
  return {
    photoId,
    capturedAt,
    captureSource: form.captureSource,
    markup: cleanMarkup(form.markup),
    target:
      form.mode === "existing"
        ? { mode: "existing", itemId: form.existingItemId ?? "" }
        : { mode: "new", details: toItemDetailsInput(form.details) },
  };
}

/**
 * Restored queue entries come back from IndexedDB as unknown. Anything that
 * does not look like a form is treated as "needs details" rather than sent,
 * so a stale shape from an older build can never post garbage.
 */
export function isShotForm(value: unknown): value is ShotForm {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<ShotForm>;
  return (
    (v.mode === "new" || v.mode === "existing") &&
    typeof v.details === "object" &&
    v.details !== null &&
    typeof (v.details as ItemDetailsValue).name === "string" &&
    (v.captureSource === "live" || v.captureSource === "file")
  );
}

export type ShotStatus = "needs-details" | "waiting" | "sending" | "saved" | "held";

/** "3 saved, 1 sending, 1 needs details", in walk order of urgency. */
export function queueSummary(statuses: ShotStatus[]): string {
  const count = (s: ShotStatus) => statuses.filter((x) => x === s).length;
  const parts: string[] = [];
  const needs = count("needs-details");
  const held = count("held");
  const moving = count("waiting") + count("sending");
  const saved = count("saved");
  if (needs) parts.push(`${needs} need${needs === 1 ? "s" : ""} details`);
  if (held) parts.push(`${held} stuck`);
  if (moving) parts.push(`${moving} sending`);
  if (saved) parts.push(`${saved} saved`);
  return parts.join(", ") || "No photos yet";
}

/** A shot that left the phone's hands for good (saved) or needs a person. */
export function isUnsent(status: ShotStatus): boolean {
  return status !== "saved";
}
