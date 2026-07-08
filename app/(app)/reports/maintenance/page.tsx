import { ReportTable } from "@/components/reports/report-table";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import { computeRepeatFailures, computeResolutionTimes, computeSpendByEquipment } from "../logic";
import { fetchMaintenanceReportData } from "../queries";
import { cell, tableData } from "../table-helpers";

/**
 * /reports/maintenance -- time to resolution, spend, and repeat failures by
 * equipment. Same computeResolutionTimes / computeSpendByEquipment /
 * computeRepeatFailures the old "Maintenance" tab used; reports.view alone is
 * enough (work_orders/equipment carry a select_authenticated RLS policy).
 */
export default async function MaintenanceReportPage() {
  await requirePermission("reports.view");

  const supabase = await createClient();
  const maintenanceData = await fetchMaintenanceReportData(supabase);

  const resolutionTimes = computeResolutionTimes(maintenanceData.workOrders, maintenanceData.equipment);
  const spendByEquipment = computeSpendByEquipment(maintenanceData.workOrders, maintenanceData.equipment);
  const repeatFailures = computeRepeatFailures(maintenanceData.workOrders, maintenanceData.equipment);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h2 className="text-[22px] font-bold text-ink">Maintenance</h2>
        <p className="text-[13px] text-muted-ink">Time to resolution, spend, and repeat failures by equipment.</p>
      </div>

      <ReportTable
        title="Time to resolution by equipment"
        description="Average hours from a work order's creation to its completion (completed orders only)."
        csvFilename="maintenance-time-to-resolution.csv"
        emptyMessage="No completed work orders yet."
        {...tableData(resolutionTimes, (r) => r.equipmentId ?? "unassigned", [
          { key: "equipment", header: "Equipment", cell: (r) => cell(r.equipmentName) },
          { key: "resolvedCount", header: "Resolved", format: "number", cell: (r) => cell(r.resolvedCount) },
          {
            key: "avgHours",
            header: "Avg. hours",
            cell: (r) => cell(`${r.avgHoursToResolve.toFixed(1)} h`, Number(r.avgHoursToResolve.toFixed(1))),
          },
        ])}
      />
      <ReportTable
        title="Spend by equipment"
        description="Total maintenance cost booked against each asset."
        csvFilename="maintenance-spend-by-equipment.csv"
        emptyMessage="No maintenance spend recorded."
        {...tableData(spendByEquipment, (r) => r.equipmentId ?? "unassigned", [
          { key: "equipment", header: "Equipment", cell: (r) => cell(r.equipmentName) },
          {
            key: "totalSpend",
            header: "Total spend",
            cell: (r) => cell(`$${r.totalSpend.toFixed(2)}`, r.totalSpend),
          },
          { key: "workOrderCount", header: "Work orders", format: "number", cell: (r) => cell(r.workOrderCount) },
        ])}
      />
      <ReportTable
        title="Repeat failures"
        description="Equipment with more than one work order raised against it."
        csvFilename="maintenance-repeat-failures.csv"
        emptyMessage="No repeat failures."
        {...tableData(repeatFailures, (r) => r.equipmentId, [
          { key: "equipment", header: "Equipment", cell: (r) => cell(r.equipmentName) },
          { key: "failureCount", header: "Work orders", format: "number", cell: (r) => cell(r.failureCount) },
        ])}
      />
    </div>
  );
}
