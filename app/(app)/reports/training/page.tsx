import { LockedSection } from "@/components/reports/locked-section";
import { ReportTable } from "@/components/reports/report-table";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import { computePassportCompletion, computeTraineeCompletion } from "../logic";
import { fetchTrainingReportData } from "../queries";
import { cell, tableData } from "../table-helpers";

const HEADING = (
  <div>
    <h2 className="text-[22px] font-bold text-ink">Training</h2>
    <p className="text-[13px] text-muted-ink">Development passport and trainee lifecycle completion.</p>
  </div>
);

/**
 * /reports/training -- development passport completion by passport, and
 * trainee lifecycle completion by onboarding roadmap. Same
 * computePassportCompletion / computeTraineeCompletion the old "Training" tab
 * used; gated on training.view (a base permission every seeded role holds).
 */
export default async function TrainingReportPage() {
  await requirePermission("reports.view");
  const canView = await hasPermission("training.view");

  if (!canView) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {HEADING}
        <LockedSection title="Training completion" requires="training.view" />
      </div>
    );
  }

  const supabase = await createClient();
  const trainingData = await fetchTrainingReportData(supabase);
  const passportCompletion = computePassportCompletion(trainingData.passportEnrollments, trainingData.passports);
  const traineeCompletion = computeTraineeCompletion(trainingData.traineeEnrollments, trainingData.roadmaps);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {HEADING}
      <ReportTable
        title="Development passport completion"
        csvFilename="passport-completion.csv"
        emptyMessage="No passport enrollments yet."
        {...tableData(passportCompletion, (r) => r.passportId, [
          { key: "passport", header: "Passport", cell: (r) => cell(r.passportName) },
          { key: "totalEnrollments", header: "Enrollments", format: "number", cell: (r) => cell(r.totalEnrollments) },
          { key: "stamped", header: "Stamped", format: "number", cell: (r) => cell(r.stamped) },
          {
            key: "completionRate",
            header: "Completion rate",
            format: "percent",
            cell: (r) => cell(r.completionRate),
          },
        ])}
      />
      <ReportTable
        title="Trainee lifecycle completion"
        csvFilename="trainee-completion.csv"
        emptyMessage="No trainee enrollments yet."
        {...tableData(traineeCompletion, (r) => r.roadmapId, [
          { key: "roadmap", header: "Roadmap", cell: (r) => cell(r.roadmapName) },
          { key: "total", header: "Enrolled", format: "number", cell: (r) => cell(r.total) },
          { key: "active", header: "Active", format: "number", cell: (r) => cell(r.active) },
          { key: "graduated", header: "Graduated", format: "number", cell: (r) => cell(r.graduated) },
          { key: "pip", header: "PIP", format: "number", cell: (r) => cell(r.pip) },
          {
            key: "graduationRate",
            header: "Graduation rate",
            format: "percent",
            cell: (r) => cell(r.graduationRate),
          },
        ])}
      />
    </div>
  );
}
