/**
 * Pure helpers for passport stamping (ARCHITECTURE.md "Training —
 * Development Passports"): "Stamping requires the trainee's rating on that
 * position to be at least 3 stars... Leadership Passports work the same way
 * but track progression toward a leadership role; stamping one can
 * automatically upgrade the person's app role... stamping a pipeline
 * passport auto-fills a slot in its mapped tier."
 */

import { QUALIFIED_THRESHOLD } from "@/app/(app)/ratings/logic";

export interface PassportItemLike {
  id: string;
}

export interface ItemProgressLike {
  item_id: string;
  completed_at: string | null;
}

/** An item counts complete once its progress row has completed_at set --
 * true for every item type (check/slider/photo/course all complete this
 * way; signature items also set completed_at when the trainer countersigns,
 * see completeSignatureItem in actions.ts). */
export function allItemsComplete(items: PassportItemLike[], progress: ItemProgressLike[]): boolean {
  if (items.length === 0) return false;
  const completedIds = new Set(progress.filter((p) => p.completed_at !== null).map((p) => p.item_id));
  return items.every((item) => completedIds.has(item.id));
}

/** Position passports additionally require the >= 3-star rating gate. */
export function canStampPosition(allComplete: boolean, currentStars: number | null): boolean {
  return allComplete && currentStars !== null && currentStars >= QUALIFIED_THRESHOLD;
}

/** Leadership passports (including pipelines) only require all items done. */
export function canStampLeadership(allComplete: boolean): boolean {
  return allComplete;
}

export interface OrgSlotLike {
  id: string;
  user_id: string | null;
  sort: number;
}

/** First vacant slot (lowest sort) in a tier, or null if the tier is full. */
export function pickVacantSlot(slots: OrgSlotLike[]): OrgSlotLike | null {
  const vacant = slots.filter((s) => s.user_id === null).sort((a, b) => a.sort - b.sort);
  return vacant[0] ?? null;
}

/** A slider item counts complete once practice progress reaches full (100). */
export const SLIDER_COMPLETE_THRESHOLD = 100;

export interface ItemProgressInput {
  checked?: boolean;
  sliderValue?: number;
  photoUrl?: string;
}

/**
 * Whether a self-reported (or trainer-corrected) progress write represents
 * real completion of the item, keyed by the passport item's type. Used by
 * upsertItemProgress (actions.ts) to decide whether completed_at should be
 * set (real completion) or cleared (unchecked / partial progress) instead of
 * always stamping "now" regardless of the value written.
 *
 * - check: complete only when checked === true.
 * - slider: complete once sliderValue reaches SLIDER_COMPLETE_THRESHOLD.
 * - photo: complete once a non-blank photoUrl is present.
 * - signature/course (and anything else): this action doesn't own their
 *   completion signal (signature completes via signItem's countersign;
 *   course has no dedicated UI yet), so fall back to the checked flag if one
 *   was sent rather than always completing.
 */
export function isItemProgressComplete(itemType: string | null, input: ItemProgressInput): boolean {
  switch (itemType) {
    case "check":
      return input.checked === true;
    case "slider":
      return typeof input.sliderValue === "number" && input.sliderValue >= SLIDER_COMPLETE_THRESHOLD;
    case "photo":
      return typeof input.photoUrl === "string" && input.photoUrl.trim().length > 0;
    default:
      return input.checked === true;
  }
}
