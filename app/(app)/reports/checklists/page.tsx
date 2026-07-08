import { LockedSection } from "@/components/reports/locked-section";
import { ReportTable } from "@/components/reports/report-table";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import { computeChecklistCompletion, selectOpenFollowUps } from "../logic";
import { fetchChecklistReportData } from "../queries";
import { cell, followUpColumns, tableData } from "../table-helpers";

const HEADING = (
  <div>
    <h2 className="text-[22px] font-bold text-ink">Checklists</h2>
    <p className="text-[13px] text-muted-ink">Completion and flagged answers by template.</p>
  </div>
);

/**
 * /reports/checklists -- completion & failure rate by template, plus the
 * open follow-ups a flagged or out-of-range answer spawned. Same
 * computeChecklistCompletion / selectOpenFollowUps the old "Checklists" tab
 * used; gated on checklists.view_reports.
 */
export default async function ChecklistsReportPage() {
  await requirePermission("reports.view");
  const canView = await hasPermission("checklists.view_reports");

  if (!canView) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {HEADING}
        <LockedSection title="Checklist reports" requires="checklists.view_reports" />
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: profiles }, checklistData] = await Promise.all([
    supabase.from("profiles").select("id, name"),
    fetchChecklistReportData(supabase),
  ]);
  const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  const checklistCompletion = computeChecklistCompletion(
    checklistData.runs,
    checklistData.templates,
    checklistData.answers,
  );
  const openFollowUps = selectOpenFollowUps(checklistData.followUps);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {HEADING}
      <ReportTable
        title="Checklist completion & failures by template"
        csvFilename="checklist-completion.csv"
        emptyMessage="No checklist runs yet."
        {...tableData(checklistCompletion, (r) => r.templateId, [
          { key: "template", header: "Template", cell: (r) => cell(r.templateName) },
          { key: "totalRuns", header: "Runs", format: "number", cell: (r) => cell(r.totalRuns) },
          { key: "completedRuns", header: "Completed", format: "number", cell: (r) => cell(r.completedRuns) },
          { key: "missedRuns", header: "Missed", format: "number", cell: (r) => cell(r.missedRuns) },
          {
            key: "completionRate",
            header: "Completion rate",
            format: "percent",
            cell: (r) => cell(r.completionRate),
          },
          { key: "flaggedAnswers", header: "Flagged answers", format: "number", cell: (r) => cell(r.flaggedAnswers) },
        ])}
      />
      <ReportTable
        title="Open follow-ups (failures)"
        csvFilename="checklist-open-followups.csv"
        emptyMessage="No open follow-ups."
        {...tableData(openFollowUps, (f) => f.id, followUpColumns(profileNameById))}
      />
    </div>
  );
}
