import { parseComponents, parseScalingRules } from "@/app/(app)/catering/logic";

/**
 * Row-editor helpers for the catering menu item form
 * (components/catering/menu-item-form.tsx). The form used to take
 * `components` and `scaling_rules` as raw JSON textareas, which nobody can
 * type on a phone. The form now edits rows and these helpers convert rows
 * to and from the JSON text the server action accepts
 * (menuItemSchema.componentsText / scalingRulesText). The saved JSON shape is
 * unchanged; the server now validates the rows too (validation.ts).
 *
 * Pure functions, no React, so the round trip is unit-testable.
 *
 * Nothing here repairs bad input. A quantity or amount that is wrong is
 * flagged by findComponentProblem / findScalingRuleProblem before the form
 * submits, and the text builders pass the typed number through unchanged, so
 * a value that slips past (or a call that skips the form) is refused by the
 * server schema in app/(app)/catering/validation.ts instead of being saved as
 * 1 or 0. The only default is a BLANK scaling amount, which means "none" (0).
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

/**
 * The number typed in a field. Blank means 0 (a scaling rule that only uses
 * one axis leaves the other empty); anything unparseable is NaN so the
 * problem checks below can flag it. Never repaired here.
 */
function typedNumber(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : Number(trimmed);
}

function isAmount(n: number, min: number): boolean {
  return Number.isFinite(n) && n >= min;
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
 * normal state after tapping "Add", not a mistake to shout about. Numbers go
 * through exactly as typed; run the problem checks first.
 */
export function rowsToComponentsText(rows: readonly ComponentRow[]): string {
  const out = rows
    .filter((r) => r.name.trim().length > 0)
    .map((r) => ({ name: r.name.trim(), qty: Number(r.qtyText.trim()) }));
  return JSON.stringify(out);
}

export function rowsToScalingRulesText(rows: readonly ScalingRuleRow[]): string {
  const out = rows
    .filter((r) => r.label.trim().length > 0)
    .map((r) => ({
      label: r.label.trim(),
      perHeadcount: typedNumber(r.perHeadcountText),
      perQty: typedNumber(r.perQtyText),
    }));
  return JSON.stringify(out);
}

/**
 * Client-side check before submit, same rules as the server schema
 * (componentRowSchema in validation.ts): a named component needs a quantity
 * of at least 1. Returns a plain sentence, or null when the rows are fine.
 */
export function findComponentProblem(rows: readonly ComponentRow[]): string | null {
  for (const row of rows) {
    const name = row.name.trim();
    if (name.length === 0) continue;
    if (row.qtyText.trim() === "" || !isAmount(Number(row.qtyText.trim()), 1)) {
      return `"${name}" needs a quantity of 1 or more.`;
    }
  }
  return null;
}

/**
 * Client-side check before submit, same rules as the server schema
 * (scalingRuleRowSchema in validation.ts). An amount must be a number of 0
 * or more (blank counts as 0). A rule with a label but no quantity on either
 * axis would generate nothing on every order, which reads as a bug on the
 * FOH setup list; say so before saving.
 */
export function findScalingRuleProblem(rows: readonly ScalingRuleRow[]): string | null {
  for (const row of rows) {
    const label = row.label.trim();
    if (label.length === 0) continue;
    const perHeadcount = typedNumber(row.perHeadcountText);
    const perQty = typedNumber(row.perQtyText);
    if (!isAmount(perHeadcount, 0) || !isAmount(perQty, 0)) {
      return `"${label}" needs per-guest and per-item amounts that are numbers of 0 or more.`;
    }
    if (perHeadcount === 0 && perQty === 0) {
      return `"${label}" needs a per-guest or per-item amount above 0.`;
    }
  }
  return null;
}
