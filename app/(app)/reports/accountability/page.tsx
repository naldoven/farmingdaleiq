import { LockedSection } from "@/components/reports/locked-section";
import { ReportTable } from "@/components/reports/report-table";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import { computeAccountabilitySummary } from "../logic";
import { fetchAccountabilityReportData } from "../queries";
import { cell, tableData } from "../table-helpers";

const HEADING = (
  <div>
    <h2 className="text-[22px] font-bold text-ink">Accountability</h2>
    <p className="text-[13px] text-muted-ink">Active points and lifetime infractions by employee.</p>
  </div>
);

/**
 * /reports/accountability -- active points and lifetime infractions per
 * employee. Same computeAccountabilitySummary the old "Accountability" tab
 * used; gated on accountability.manage (the only permission the infractions
 * table's RLS grants a SELECT policy to at all).
 */
export default async function AccountabilityReportPage() {
  await requirePermission("reports.view");
  const canView = await hasPermission("accountability.manage");

  if (!canView) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {HEADING}
        <LockedSection title="Accountability summary" requires="accountability.manage" />
      </div>
    );
  }

  const supabase = await createClient();
  const now = new Date();
  const [{ data: profiles }, accountabilityData] = await Promise.all([
    supabase.from("profiles").select("id, name"),
    fetchAccountabilityReportData(supabase),
  ]);
  const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  const accountabilitySummary = computeAccountabilitySummary(accountabilityData.infractions, now);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {HEADING}
      <ReportTable
        title="Accountability summary"
        csvFilename="accountability-summary.csv"
        emptyMessage="No infractions on record."
        {...tableData(accountabilitySummary, (r) => r.userId, [
          { key: "user", header: "Employee", cell: (r) => cell(profileNameById.get(r.userId) ?? "Unknown") },
          { key: "activePoints", header: "Active points", format: "number", cell: (r) => cell(r.activePoints) },
          {
            key: "totalInfractions",
            header: "Lifetime infractions",
            format: "number",
            cell: (r) => cell(r.totalInfractions),
          },
        ])}
      />
    </div>
  );
}
