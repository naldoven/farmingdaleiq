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
 */
export function escapeCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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
