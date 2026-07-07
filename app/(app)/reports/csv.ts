/**
 * CSV export helper for the Reporting module (ARCHITECTURE.md "Reporting":
 * "CSV export on report tables"; PLAN.md P2 reporting agent). Kept dependency
 * -free (no DOM, no "use client") so it is unit-testable and shared by every
 * report table via components/reports/report-table.tsx, which does the
 * DOM-side download (Blob + anchor click) using the string this returns.
 */

export type CsvValue = string | number | boolean | null | undefined;

/**
 * Escapes a single cell per RFC 4180: wraps in double quotes (doubling any
 * embedded quote) whenever the value contains a comma, quote, or line break.
 * `null`/`undefined` become an empty cell rather than the literal string
 * "null"/"undefined".
 *
 * FIQ-07: before RFC-4180 quoting, neutralize CSV formula injection. A
 * user-entered string cell (task/work-order/reward/guest name) that starts
 * with =,+,-,@ or a tab/CR is evaluated as a formula when the export is opened
 * in Excel/Sheets (e.g. `=HYPERLINK(...)`), so we prefix it with a single
 * quote to force the spreadsheet to treat it as text. The guard applies only
 * to string values, so genuine numeric cells (including negatives like -5)
 * are never altered.
 */
export function escapeCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const isString = typeof value === "string";
  const str = isString ? value : String(value);
  const guarded = isString && /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\r\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/**
 * Builds a full CSV document (header row + data rows) from already-shaped
 * cell values. CRLF line endings per RFC 4180 (matches what Excel and most
 * spreadsheet tools expect).
 */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(","));
  }
  return lines.join("\r\n");
}
