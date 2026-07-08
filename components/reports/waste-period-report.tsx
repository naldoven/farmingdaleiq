"use client";

import { useMemo, useState } from "react";

import {
  filterEntriesByPeriod,
  rollupByCategory,
  rollupByItem,
  type PeriodKey,
  type WasteCategoryForRollup,
  type WasteEntryForRollup,
  type WasteItemForRollup,
} from "@/app/(app)/waste/logic";
import { ChipRow, FilterChip } from "@/components/mobile";
import type { ReportCell, ReportColumn, ReportRow } from "@/components/reports/cells";
import { ReportTable } from "@/components/reports/report-table";

/**
 * Waste report for /reports/waste. Owns a client-side period control (a
 * ChipRow of FilterChips, matching the KitchenIQ filter-chip pattern) so the
 * reader can switch week/month/quarter/all without a server round trip or
 * losing their place (FIQ reporting med: this used to hardcode "month"). The
 * rollups are the SAME pure functions the Waste module itself uses
 * (app/(app)/waste/logic.ts), re-sliced here per the selected period; this
 * component only reads the plain rows the server fetched and never writes.
 */

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "all", label: "All time" },
];

const PERIOD_LABEL: Record<PeriodKey, string> = {
  week: "last 7 days",
  month: "last 30 days",
  quarter: "last 90 days",
  all: "all time",
};

function cell(value: ReportCell["value"], csv?: ReportCell["value"]): ReportCell {
  return csv === undefined ? { value } : { value, csv };
}

export function WastePeriodReport({
  entries,
  items,
  categories,
}: {
  entries: WasteEntryForRollup[];
  items: WasteItemForRollup[];
  categories: WasteCategoryForRollup[];
}) {
  const [period, setPeriod] = useState<PeriodKey>("month");

  const { byItem, byCategory } = useMemo(() => {
    const filtered = filterEntriesByPeriod(entries, period);
    return {
      byItem: rollupByItem(filtered, items),
      byCategory: rollupByCategory(filtered, items, categories),
    };
  }, [entries, items, categories, period]);

  const itemColumns: ReportColumn[] = [
    { key: "itemName", header: "Item" },
    { key: "entryCount", header: "Entries", format: "number" },
    { key: "totalQuantity", header: "Total quantity" },
    { key: "totalCost", header: "Est. cost" },
  ];
  const itemRows: ReportRow[] = byItem.map((r) => ({
    key: r.itemId,
    cells: {
      itemName: cell(r.itemName),
      entryCount: cell(r.entryCount),
      totalQuantity: cell(`${r.totalQuantity} ${r.unit}`, r.totalQuantity),
      totalCost: cell(r.totalCost != null ? `$${r.totalCost.toFixed(2)}` : "—", r.totalCost),
    },
  }));

  const categoryColumns: ReportColumn[] = [
    { key: "categoryName", header: "Category" },
    { key: "entryCount", header: "Entries", format: "number" },
    { key: "totalCost", header: "Est. cost" },
  ];
  const categoryRows: ReportRow[] = byCategory.map((r) => ({
    key: r.categoryId ?? "uncategorized",
    cells: {
      categoryName: cell(r.categoryName),
      entryCount: cell(r.entryCount),
      totalCost: cell(r.totalCost != null ? `$${r.totalCost.toFixed(2)}` : "—", r.totalCost),
    },
  }));

  const windowLabel = PERIOD_LABEL[period];

  return (
    <div className="flex flex-col gap-4">
      <ChipRow>
        {PERIOD_OPTIONS.map((option) => (
          <FilterChip
            key={option.key}
            active={period === option.key}
            onClick={() => setPeriod(option.key)}
          >
            {option.label}
          </FilterChip>
        ))}
      </ChipRow>

      <ReportTable
        title={`Waste by item (${windowLabel})`}
        columns={itemColumns}
        rows={itemRows}
        csvFilename="waste-by-item.csv"
        emptyMessage="No waste logged in this period."
      />
      <ReportTable
        title={`Waste by category (${windowLabel})`}
        columns={categoryColumns}
        rows={categoryRows}
        csvFilename="waste-by-category.csv"
        emptyMessage="No waste logged in this period."
      />
    </div>
  );
}
