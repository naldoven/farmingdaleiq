import { MAX_MODS, MOD_NAME_MAX, type FaultSource } from "@/app/(app)/guest-recovery/constants";

/**
 * Item modifications and the fault check (ARCHITECTURE.md "Guest Recovery").
 * Pure helpers, shared by the log form, the validation schema, the guest
 * messages and the reports, so the same words and the same rule show up
 * everywhere.
 */

export interface ItemMods {
  removed?: string[] | null;
  added?: string[] | null;
  note?: string | null;
}

/**
 * Two questions the leader answers about a wrong item or wrong mod:
 *   receiptOk: did the receipt or sticker show what the guest ordered, mods included?
 *   itemOk:    did the item in the box match that receipt or sticker?
 * The answers point at who to look at:
 *   receipt was wrong                    -> the order was entered wrong
 *   receipt right, item did not match it -> made wrong (kitchen or primary)
 *   receipt right, item matched it       -> bagging or hand-off (the guest got
 *                                            the wrong thing from the right one)
 * A question left blank when it matters is "not sure". A wrong receipt settles
 * it on its own, so the item answer does not matter then.
 */
export function deriveFaultSource(
  receiptOk: boolean | null | undefined,
  itemOk: boolean | null | undefined,
): FaultSource {
  if (receiptOk === false) return "order_entry";
  if (receiptOk === true && itemOk === false) return "made_wrong";
  if (receiptOk === true && itemOk === true) return "bagging";
  return "not_sure";
}

/** "no pickles, no tomato, extra sauce, cut in half". Empty when there are no mods. */
export function formatMods(mods: ItemMods): string {
  const parts = [
    ...(mods.removed ?? []).map((name) => `no ${name.trim().toLowerCase()}`),
    ...(mods.added ?? []).map((name) => name.trim().toLowerCase()),
    ...(mods.note?.trim() ? [mods.note.trim()] : []),
  ].filter(Boolean);
  return parts.join(", ");
}

export function hasMods(mods: ItemMods): boolean {
  return formatMods(mods) !== "";
}

/**
 * Turns "Pickles, Tomato" (or one per line) into a clean list: trimmed, no
 * blanks, no repeats (any capitalization), each name and the list capped.
 */
export function parseList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const name = raw.trim().slice(0, MOD_NAME_MAX);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_MODS) break;
  }
  return out;
}
