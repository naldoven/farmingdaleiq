import type {
  CellFormat,
  CellPrimitive,
  ReportCell,
  ReportColumn,
  ReportRow,
} from "@/components/reports/cells";

/**
 * Server-side table-building helpers shared by every /reports/<type> page
 * (split out of the old single-page app/(app)/reports/page.tsx so each report
 * page can build its own serializable `ReportTable` props without repeating
 * this boilerplate).
 *
 * FIQ R1: these helpers exist so the RSC boundary only ever crosses plain
 * data -- `ReportColumn[]` (header + a `CellFormat` enum) and `ReportRow[]`
 * (raw cell values) -- never render/csv/rowKey functions, which are not
 * serializable and used to 500 the page. See components/reports/cells.ts.
 */

/** A column paired with the server-side builder that turns a row into a serializable cell. */
export interface ReportCol<T> {
  key: string;
  header: string;
  format?: CellFormat;
  cell: (row: T) => ReportCell;
}

/** A serializable cell; pass `csv` only when the export value differs from the raw display value. */
export function cell(value: CellPrimitive, csv?: CellPrimitive): ReportCell {
  return csv === undefined ? { value } : { value, csv };
}

/** Runs every column's cell-builder server-side, leaving only plain data to cross the RSC boundary. */
export function tableData<T>(
  rows: T[],
  rowKey: (row: T) => string,
  cols: ReportCol<T>[],
): { columns: ReportColumn[]; rows: ReportRow[] } {
  return {
    columns: cols.map(({ key, header, format }) => ({ key, header, format })),
    rows: rows.map((row) => ({
      key: rowKey(row),
      cells: Object.fromEntries(cols.map((col) => [col.key, col.cell(row)])),
    })),
  };
}

/** Builds an "Assigned to" label resolver from a user id or position id, given name lookup maps. */
export function assigneeLabelFactory(
  profileNameById: Map<string, string>,
  positionNameById: Map<string, string>,
): (assignedUserId: string | null, assignedPositionId: string | null) => string {
  return (assignedUserId, assignedPositionId) => {
    if (assignedUserId) return profileNameById.get(assignedUserId) ?? "Unknown";
    if (assignedPositionId) return `${positionNameById.get(assignedPositionId) ?? "Unknown position"} (position)`;
    return "Unassigned";
  };
}

/** Shared follow-up column set (description / assigned to / due) used by every checklist follow-up table. */
export function followUpColumns<
  T extends { description: string; assigned_to: string | null; due_at: string | null },
>(profileNameById: Map<string, string>): ReportCol<T>[] {
  return [
    { key: "description", header: "Follow-up", cell: (f) => cell(f.description) },
    {
      key: "assigned_to",
      header: "Assigned to",
      cell: (f) => cell(f.assigned_to ? (profileNameById.get(f.assigned_to) ?? "Unknown") : "Unassigned"),
    },
    { key: "due_at", header: "Due", format: "datetime", cell: (f) => cell(f.due_at) },
  ];
}
