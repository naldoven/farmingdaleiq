"use client";

import { useMemo, useState } from "react";

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
import {
  PERIOD_KEYS,
  filterEntriesByPeriod,
  formatCentsAsUsd,
  rollupByCategory,
  rollupByItem,
  type PeriodKey,
  type WasteCategoryForRollup,
  type WasteEntryForRollup,
  type WasteItemForRollup,
} from "@/app/(app)/waste/logic";

// Rolling day counts, NOT calendar periods -- PERIOD_DAYS in
// app/(app)/waste/logic.ts is {week: 7, month: 30, quarter: 90} measured back
// from now. Labelling them "This month" implied a calendar month, so on Aug 1
// the tab showed Jul 2 - Aug 1 while claiming to show August, and it disagreed
// with /reports/waste, which labels the identical math "last 30 days". Same
// wording in both places now.
const PERIOD_LABELS: Record<PeriodKey, string> = {
  week: "Last 7 days",
  month: "Last 30 days",
  quarter: "Last 90 days",
  all: "All time",
};

/**
 * Waste rollups by item and by category, over a selectable period
 * (PLAN.md S5: "rollup views by item/category/period"). Period switching is
 * client-side state over data already fetched by app/(app)/waste/page.tsx,
 * not a URL param + refetch -- that keeps this component's own state (and
 * the parent's Tabs state) intact when the manager flips periods, instead
 * of a full-page navigation remounting the tree.
 */
export function WasteReports({
  entries,
  items,
  categories,
}: {
  entries: WasteEntryForRollup[];
  items: WasteItemForRollup[];
  categories: WasteCategoryForRollup[];
}) {
  const [period, setPeriod] = useState<PeriodKey>("month");

  const filtered = useMemo(
    () => filterEntriesByPeriod(entries, period),
    [entries, period],
  );
  const itemRollup = useMemo(() => rollupByItem(filtered, items), [filtered, items]);
  const categoryRollup = useMemo(
    () => rollupByCategory(filtered, items, categories),
    [filtered, items, categories],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {PERIOD_KEYS.map((key) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={key === period ? "default" : "outline"}
            onClick={() => setPeriod(key)}
          >
            {PERIOD_LABELS[key]}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By item</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Entries</TableHead>
                <TableHead>Total quantity</TableHead>
                <TableHead>Est. cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itemRollup.map((row) => (
                <TableRow key={row.itemId}>
                  <TableCell className="font-medium">{row.itemName}</TableCell>
                  <TableCell>{row.entryCount}</TableCell>
                  <TableCell>
                    {row.totalQuantity} {row.unit}
                  </TableCell>
                  <TableCell>{formatCentsAsUsd(row.totalCostCents)}</TableCell>
                </TableRow>
              ))}
              {itemRollup.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No waste logged in this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By category</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Entries</TableHead>
                <TableHead>Est. cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryRollup.map((row) => (
                <TableRow key={row.categoryId ?? "uncategorized"}>
                  <TableCell className="font-medium">{row.categoryName}</TableCell>
                  <TableCell>{row.entryCount}</TableCell>
                  {/* "+" marks a partial total: some entries in this category
                      are on items with no unit cost, so they contribute
                      quantity but no dollars. */}
                  <TableCell
                    title={
                      row.unknownEntryCount > 0
                        ? `${row.unknownEntryCount} of ${row.entryCount} entries have no unit cost set.`
                        : undefined
                    }
                  >
                    {formatCentsAsUsd(row.totalCostCents)}
                    {row.unknownEntryCount > 0 && row.totalCostCents != null ? "+" : ""}
                  </TableCell>
                </TableRow>
              ))}
              {categoryRollup.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No waste logged in this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
