import type { CsvValue } from "@/app/(app)/reports/csv";

/**
 * Serializable cell/column descriptors shared by the /reports page (a React
 * Server Component) and the ReportTable client component.
 *
 * FIQ R1: the /reports page previously passed `render`/`rowKey`/`csvValue`
 * FUNCTIONS as props to `<ReportTable>` (a "use client" component). Functions
 * are not serializable across the RSC boundary, so Next.js threw
 * "Functions cannot be passed directly to Client Components" and the whole
 * page 500'd. The fix: the server passes only plain data -- a small typed
 * `CellFormat` enum per column plus raw serializable cell values -- and the
 * client component owns all rendering and CSV derivation, keyed off that
 * enum. Nothing crossing the boundary is ever a function.
 *
 * Kept dependency-free (no React, no "use client") so it can be unit-tested
 * and imported from both the server page and the client table.
 */

/**
 * How a column's raw value is rendered in a table cell and exported to CSV.
 * The server sets one of these per column; the client interprets the raw
 * `ReportCell.value` accordingly:
 *  - `text`    : a pre-resolved string/number, rendered as-is.
 *  - `number`  : a numeric value, rendered as-is.
 *  - `datetime`: an ISO timestamp (or null), rendered via `toLocaleString`.
 *  - `date`    : an ISO date (or null), rendered via `toLocaleDateString`.
 *  - `percent` : a 0..1 ratio, rendered as a whole-number percentage.
 *  - `badge`   : a status token, rendered as an outline badge (CSV: raw token).
 *  - `overdue` : a boolean, rendered as a destructive "Overdue" badge or a dash.
 */
export type CellFormat = "text" | "number" | "datetime" | "date" | "percent" | "badge" | "overdue";

export type CellPrimitive = string | number | boolean | null;

export interface ReportColumn {
  key: string;
  header: string;
  /** Defaults to `text` when omitted. */
  format?: CellFormat;
}

export interface ReportCell {
  /** Raw, serializable value the client formats per its column's `format`. */
  value: CellPrimitive;
  /** Explicit CSV value when it must differ from the derived one (e.g. a "$1.23" display cell whose CSV is the raw number). */
  csv?: CellPrimitive;
}

export interface ReportRow {
  key: string;
  cells: Record<string, ReportCell>;
}

const EMPTY = "—";

export function formatDateTime(value: CellPrimitive): string {
  if (value == null || value === "") return EMPTY;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? EMPTY : date.toLocaleString();
}

export function formatDate(value: CellPrimitive): string {
  if (value == null || value === "") return EMPTY;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? EMPTY : date.toLocaleDateString();
}

export function formatPercent(value: CellPrimitive): string {
  if (value == null || value === "") return EMPTY;
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n * 100)}%` : EMPTY;
}

export function badgeLabel(value: CellPrimitive): string {
  return value == null ? "" : String(value).replace(/_/g, " ");
}

/**
 * The CSV value for a cell, given its column format. An explicit
 * `cell.csv` always wins; otherwise it's derived from the raw value the same
 * way the display is, so the export matches what the reader sees (dates as
 * localized strings, percents as whole numbers, overdue as yes/no, badges as
 * the raw status token). This is the single source of truth for CSV shape,
 * shared by the client table's Export button and its unit tests.
 */
export function cellCsvValue(cell: ReportCell, format: CellFormat = "text"): CsvValue {
  if (cell.csv !== undefined) return cell.csv;
  const { value } = cell;
  switch (format) {
    case "datetime":
      return formatDateTime(value);
    case "date":
      return formatDate(value);
    case "percent":
      return value != null && value !== "" && Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : "";
    case "overdue":
      return value ? "yes" : "no";
    case "badge":
      return value == null ? "" : String(value);
    case "number":
    case "text":
    default:
      if (value === null) return "";
      if (typeof value === "boolean") return String(value);
      return value;
  }
}
