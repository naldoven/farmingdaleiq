"use client";

import type { ReactNode } from "react";

import { toCsv, type CsvValue } from "@/app/(app)/reports/csv";
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

export interface ReportColumn<T> {
  key: string;
  header: string;
  /** What renders in the table cell. */
  render: (row: T) => ReactNode;
  /** What goes in the CSV export for this column (defaults to `render`'s return value if omitted). */
  csvValue?: (row: T) => CsvValue;
}

/**
 * Generic report table with a built-in "Export CSV" button
 * (ARCHITECTURE.md "Reporting": "CSV export on report tables"). Every
 * per-module report table and dashboard tile in app/(app)/reports/page.tsx
 * renders through this one component so the export behavior (and its
 * escaping rules, see app/(app)/reports/csv.ts) is implemented exactly once.
 *
 * Data is fetched server-side by page.tsx and passed in as plain rows; this
 * component only needs "use client" for the CSV download itself (Blob +
 * anchor click requires the DOM).
 */
export function ReportTable<T>({
  title,
  description,
  columns,
  rows,
  rowKey,
  csvFilename,
  emptyMessage = "Nothing to show.",
}: {
  title: string;
  description?: string;
  columns: ReportColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  csvFilename: string;
  emptyMessage?: string;
}) {
  function handleExport() {
    const csv = toCsv(
      columns.map((c) => c.header),
      rows.map((row) => columns.map((c) => (c.csvValue ? c.csvValue(row) : cellToCsvValue(c.render(row))))),
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
              <TableRow key={rowKey(row)}>
                {columns.map((c) => (
                  <TableCell key={c.key}>{c.render(row)}</TableCell>
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

/**
 * Best-effort fallback when a column has no explicit `csvValue`: only
 * string/number/boolean render output round-trips cleanly into a CSV cell,
 * so anything else (a Badge, an icon, `null`) exports as an empty cell
 * rather than "[object Object]". Every column that renders a rich node
 * should supply its own `csvValue`.
 */
function cellToCsvValue(node: ReactNode): CsvValue {
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    return node;
  }
  return "";
}
