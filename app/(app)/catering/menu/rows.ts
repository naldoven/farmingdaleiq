import { parseComponents, parseScalingRules } from "@/app/(app)/catering/logic";

/**
 * Row-editor helpers for the catering menu item form
 * (components/catering/menu-item-form.tsx). The form used to take
 * `components` and `scaling_rules` as raw JSON textareas, which nobody can
 * type on a phone. The form now edits rows and these helpers convert rows
 * to and from the JSON text the server action still accepts
 * (menuItemSchema.componentsText / scalingRulesText), so the action and
 * its validation are unchanged.
 *
 * Pure functions, no React, so the round trip is unit-testable.
 */

export interface ComponentRow {
  name: string;
  /** Text, not number, so a half-typed "1." does not snap to 1 mid-keystroke. */
  qtyText: string;
}

export interface ScalingRuleRow {
  label: string;
  perHeadcountText: string;
  perQtyText: string;
}

export function emptyComponentRow(): ComponentRow {
  return { name: "", qtyText: "1" };
}

export function emptyScalingRuleRow(): ScalingRuleRow {
  return { label: "", perHeadcountText: "0", perQtyText: "0" };
}

function numberOrZero(text: string): number {
  const n = Number(text.trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** JSON text from the database row to editable rows. Tolerates any shape the parser does. */
export function componentsTextToRows(text: string): ComponentRow[] {
  let parsed: unknown = [];
  try {
    parsed = JSON.parse(text || "[]");
  } catch {
    parsed = [];
  }
  return parseComponents(parsed).map((c) => ({ name: c.name, qtyText: String(c.qty) }));
}

export function scalingRulesTextToRows(text: string): ScalingRuleRow[] {
  let parsed: unknown = [];
  try {
    parsed = JSON.parse(text || "[]");
  } catch {
    parsed = [];
  }
  return parseScalingRules(parsed).map((r) => ({
    label: r.label,
    perHeadcountText: String(r.perHeadcount),
    perQtyText: String(r.perQty),
  }));
}

/**
 * Rows back to the JSON text the action expects. Blank names are dropped
 * rather than rejected: a spare empty row at the bottom of the form is the
 * normal state after tapping "Add", not a mistake to shout about.
 */
export function rowsToComponentsText(rows: readonly ComponentRow[]): string {
  const out = rows
    .filter((r) => r.name.trim().length > 0)
    .map((r) => {
      const qty = numberOrZero(r.qtyText);
      return { name: r.name.trim(), qty: qty > 0 ? qty : 1 };
    });
  return JSON.stringify(out);
}

export function rowsToScalingRulesText(rows: readonly ScalingRuleRow[]): string {
  const out = rows
    .filter((r) => r.label.trim().length > 0)
    .map((r) => ({
      label: r.label.trim(),
      perHeadcount: numberOrZero(r.perHeadcountText),
      perQty: numberOrZero(r.perQtyText),
    }));
  return JSON.stringify(out);
}

/**
 * Client-side check before submit. A rule with a label but no quantity on
 * either axis would generate nothing on every order, which reads as a bug
 * on the FOH setup list; say so before saving.
 */
export function findScalingRuleProblem(rows: readonly ScalingRuleRow[]): string | null {
  for (const row of rows) {
    if (row.label.trim().length === 0) continue;
    if (numberOrZero(row.perHeadcountText) === 0 && numberOrZero(row.perQtyText) === 0) {
      return `"${row.label.trim()}" needs a per-guest or per-item amount above 0.`;
    }
  }
  return null;
}
