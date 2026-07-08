"use client";

import type { ReactNode } from "react";

import { toCsv } from "@/app/(app)/reports/csv";
import {
  badgeLabel,
  cellCsvValue,
  formatDate,
  formatDateTime,
  formatPercent,
  type CellFormat,
  type CellPrimitive,
  type ReportCell,
  type ReportColumn,
  type ReportRow,
} from "@/components/reports/cells";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Generic report table with a built-in "Export CSV" button
 * (ARCHITECTURE.md "Reporting": "CSV export on report tables"). Every
 * per-module report table and dashboard tile in app/(app)/reports/page.tsx
 * renders through this one component so the export behavior (and its
 * escaping rules, see app/(app)/reports/csv.ts) is implemented exactly once.
 *
 * FIQ R1: this is a client component, so its props must be serializable.
 * The server (page.tsx) passes plain data only -- serializable `columns`
 * (header + a `CellFormat` enum) and `rows` (raw cell values) -- never
 * render/csv/rowKey FUNCTIONS, which cannot cross the RSC boundary and used
 * to 500 the page. All cell rendering and CSV shaping happens here, keyed off
 * each column's `format` (see components/reports/cells.ts).
 */
export function ReportTable({
  title,
  description,
  columns,
  rows,
  csvFilename,
  emptyMessage = "Nothing to show.",
}: {
  title: string;
  description?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  csvFilename: string;
  emptyMessage?: string;
}) {
  function handleExport() {
    const csv = toCsv(
      columns.map((c) => c.header),
      rows.map((row) => columns.map((c) => cellCsvValue(cellFor(row, c.key), c.format))),
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={handleExport} disabled={rows.length === 0}>
          Export CSV
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key}>{c.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                {columns.map((c) => (
                  <TableCell key={c.key}>{renderCell(cellFor(row, c.key).value, c.format)}</TableCell>
                ))}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function cellFor(row: ReportRow, key: string): ReportCell {
  return row.cells[key] ?? { value: null };
}

/** Renders a raw cell value per its column's format (see components/reports/cells.ts). */
function renderCell(value: CellPrimitive, format: CellFormat = "text"): ReactNode {
  switch (format) {
    case "datetime":
      return formatDateTime(value);
    case "date":
      return formatDate(value);
    case "percent":
      return formatPercent(value);
    case "badge":
      return value == null ? "—" : <Badge variant="outline">{badgeLabel(value)}</Badge>;
    case "overdue":
      return value ? <Badge variant="destructive">Overdue</Badge> : "—";
    case "number":
    case "text":
    default:
      return value == null ? "" : String(value);
  }
}
