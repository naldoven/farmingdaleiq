import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type CellFormat,
  type CellPrimitive,
  type ReportCell,
  type ReportColumn,
  type ReportRow,
} from "@/components/reports/cells";
import { LockedSection } from "@/components/reports/locked-section";
import { ReportTable } from "@/components/reports/report-table";
import { WastePeriodReport } from "@/components/reports/waste-period-report";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type {
  WasteCategoryForRollup,
  WasteEntryForRollup,
  WasteItemForRollup,
} from "@/app/(app)/waste/logic";
import {
  computeAccountabilitySummary,
  computeActivePointsByUser,
  computeChecklistCompletion,
  computePassportCompletion,
  computeRepeatFailures,
  computeResolutionTimes,
  computeSpendByEquipment,
  computeTraineeCompletion,
  findEmployeesNearThreshold,
  findWasteSpikes,
  selectCateringFollowUpsDue,
  selectDownEquipment,
  selectOpenFollowUps,
  selectOpenOrOverdueWorkOrders,
  selectOverdueTasks,
  selectPendingRewardClaims,
  summarizeRewardClaims,
  summarizeTokenActivity,
} from "./logic";
import {
  fetchAccountabilityReportData,
  fetchBaseReportData,
  fetchCateringReportData,
  fetchChecklistReportData,
  fetchMaintenanceReportData,
  fetchRewardReportData,
  fetchTokenReportData,
  fetchTrainingReportData,
} from "./queries";

/**
 * /reports — store dashboard + per-module report tables, all with CSV export
 * (ARCHITECTURE.md "Reporting"; PLAN.md P2 item 2). Read-only: every query
 * below is a `.select()` over another module's tables, nothing here ever
 * writes to them.
 *
 * `reports.view` gates entry to the page at all, but several sections read
 * tables that are further permission-gated at the RLS layer for reasons
 * specific to their own module (accountability's anonymity rule, the token
 * ledger, reward claims, catering). This page re-checks those same
 * permissions before querying (and before rendering the corresponding
 * section) so a `reports.view`-only role (Team Leader, per the seeded
 * permission ladder) sees a clear "you don't have permission" note instead
 * of a confusingly empty table for sections it can't see anyway.
 *
 * FIQ R1: every table renders through <ReportTable>, a client component.
 * This server component therefore builds only SERIALIZABLE table data --
 * `ReportColumn[]` (header + a `CellFormat` enum) and `ReportRow[]` (raw
 * cell values) via `tableData()` below -- and passes that across the RSC
 * boundary. It never passes render/csv/rowKey functions (which are not
 * serializable and used to 500 the page). All cell formatting lives client-
 * side in ReportTable, keyed off each column's format.
 */

/** A column paired with the server-side builder that turns a row into a serializable cell. */
interface ReportCol<T> {
  key: string;
  header: string;
  format?: CellFormat;
  cell: (row: T) => ReportCell;
}

/** A serializable cell; pass `csv` only when the export value differs from the raw display value. */
function cell(value: CellPrimitive, csv?: CellPrimitive): ReportCell {
  return csv === undefined ? { value } : { value, csv };
}

/** Runs every column's cell-builder server-side, leaving only plain data to cross the RSC boundary. */
function tableData<T>(
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

export default async function ReportsPage() {
  await requirePermission("reports.view");

  const supabase = await createClient();
  const now = new Date();

  const [canViewChecklistReports, canViewAccountability, canViewTokens, canViewFulfillClaims, canViewManageClaims, canViewCateringA, canViewCateringB, canViewTraining] =
    await Promise.all([
      hasPermission("checklists.view_reports"),
      hasPermission("accountability.manage"),
      hasPermission("tokens.manage"),
      hasPermission("rewards.fulfill"),
      hasPermission("rewards.manage"),
      hasPermission("catering.view"),
      hasPermission("catering.manage"),
      hasPermission("training.view"),
    ]);
  const canViewRewards = canViewFulfillClaims || canViewManageClaims;
  const canViewCatering = canViewCateringA || canViewCateringB;

  // Base reads: every table here has a select_authenticated (any signed-in
  // user) RLS policy, so reports.view alone is enough.
  const base = await fetchBaseReportData(supabase);
  const maintenanceData = await fetchMaintenanceReportData(supabase);

  const checklistData = canViewChecklistReports ? await fetchChecklistReportData(supabase) : null;
  const accountabilityData = canViewAccountability ? await fetchAccountabilityReportData(supabase) : null;
  const tokenData = canViewTokens ? await fetchTokenReportData(supabase) : null;
  const rewardData = canViewRewards ? await fetchRewardReportData(supabase) : null;
  const cateringData = canViewCatering ? await fetchCateringReportData(supabase) : null;
  const trainingData = canViewTraining ? await fetchTrainingReportData(supabase) : null;

  const profileNameById = new Map(base.profiles.map((p) => [p.id, p.name]));
  const positionNameById = new Map(base.positions.map((p) => [p.id, p.name]));

  // ---- Dashboard tiles ----
  const overdueTasks = selectOverdueTasks(base.tasks, now);
  const openFollowUps = checklistData ? selectOpenFollowUps(checklistData.followUps) : [];
  const wasteEntries: WasteEntryForRollup[] = base.wasteEntries.map((e) => ({
    id: e.id,
    itemId: e.item_id,
    quantity: e.quantity,
    loggedAt: e.logged_at,
  }));
  const wasteItems: WasteItemForRollup[] = base.wasteItems.map((i) => ({
    id: i.id,
    name: i.name,
    categoryId: i.category_id,
    unit: i.unit as WasteItemForRollup["unit"],
    unitCost: i.unit_cost,
  }));
  const wasteCategories: WasteCategoryForRollup[] = base.wasteCategories.map((c) => ({
    id: c.id,
    name: c.name,
  }));
  const wasteSpikes = findWasteSpikes(
    base.wasteEntries.map((e) => ({ id: e.id, itemId: e.item_id, quantity: e.quantity, loggedAt: e.logged_at })),
    base.wasteItems.map((i) => ({ id: i.id, name: i.name, unit: i.unit })),
    now,
  );
  const pendingClaims = rewardData ? selectPendingRewardClaims(rewardData.claims) : [];
  const activePointsByUser = accountabilityData
    ? computeActivePointsByUser(accountabilityData.infractions, now)
    : new Map<string, number>();
  const nearThreshold = accountabilityData
    ? findEmployeesNearThreshold(activePointsByUser, accountabilityData.disciplinaryTypes)
    : [];
  const openOrOverdueWorkOrders = selectOpenOrOverdueWorkOrders(base.workOrders, now);
  const downEquipment = selectDownEquipment(base.equipment);
  const cateringFollowUpsDue = cateringData ? selectCateringFollowUpsDue(cateringData.followUps, now) : [];
  const cateringOrderById = new Map((cateringData?.orders ?? []).map((o) => [o.id, o]));

  // ---- Per-module reports ----
  const checklistCompletion = checklistData
    ? computeChecklistCompletion(checklistData.runs, checklistData.templates, checklistData.answers)
    : [];
  const accountabilitySummary = accountabilityData
    ? computeAccountabilitySummary(accountabilityData.infractions, now)
    : [];
  const tokenActivity = tokenData ? summarizeTokenActivity(tokenData.transactions) : [];
  const rewardClaimSummary = rewardData ? summarizeRewardClaims(rewardData.claims) : null;
  const rewardNameById = new Map((rewardData?.rewards ?? []).map((r) => [r.id, r.name]));
  const passportCompletion = trainingData
    ? computePassportCompletion(trainingData.passportEnrollments, trainingData.passports)
    : [];
  const traineeCompletion = trainingData
    ? computeTraineeCompletion(trainingData.traineeEnrollments, trainingData.roadmaps)
    : [];

  // ---- Maintenance reports (reports.view is enough) ----
  const resolutionTimes = computeResolutionTimes(maintenanceData.workOrders, maintenanceData.equipment);
  const spendByEquipment = computeSpendByEquipment(maintenanceData.workOrders, maintenanceData.equipment);
  const repeatFailures = computeRepeatFailures(maintenanceData.workOrders, maintenanceData.equipment);

  function assigneeLabel(assignedUserId: string | null, assignedPositionId: string | null): string {
    if (assignedUserId) return profileNameById.get(assignedUserId) ?? "Unknown";
    if (assignedPositionId) return `${positionNameById.get(assignedPositionId) ?? "Unknown position"} (position)`;
    return "Unassigned";
  }

  const followUpColumns = <T extends { description: string; assigned_to: string | null; due_at: string | null }>(): ReportCol<T>[] => [
    { key: "description", header: "Follow-up", cell: (f) => cell(f.description) },
    {
      key: "assigned_to",
      header: "Assigned to",
      cell: (f) => cell(f.assigned_to ? (profileNameById.get(f.assigned_to) ?? "Unknown") : "Unassigned"),
    },
    { key: "due_at", header: "Due", format: "datetime", cell: (f) => cell(f.due_at) },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Reports</h1>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="checklists">Checklists</TabsTrigger>
          <TabsTrigger value="waste">Waste</TabsTrigger>
          <TabsTrigger value="accountability">Accountability</TabsTrigger>
          <TabsTrigger value="tokens">Tokens &amp; rewards</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="flex flex-col gap-4">
          <ReportTable
            title="Overdue to-dos"
            csvFilename="overdue-tasks.csv"
            emptyMessage="No overdue to-dos."
            {...tableData(overdueTasks, (t) => t.id, [
              { key: "title", header: "Task", cell: (t) => cell(t.title) },
              {
                key: "assignee",
                header: "Assigned to",
                cell: (t) => cell(assigneeLabel(t.assigned_user_id, t.assigned_position_id)),
              },
              { key: "due_at", header: "Due", format: "datetime", cell: (t) => cell(t.due_at) },
            ])}
          />

          {canViewChecklistReports ? (
            <ReportTable
              title="Flagged checklist answers"
              description="Open follow-ups spawned by a flagged or out-of-range answer."
              csvFilename="flagged-checklist-answers.csv"
              emptyMessage="No open follow-ups."
              {...tableData(openFollowUps, (f) => f.id, followUpColumns())}
            />
          ) : (
            <LockedSection title="Flagged checklist answers" requires="checklists.view_reports" />
          )}

          <ReportTable
            title="Waste spikes"
            description="Items logged this week at 1.5x+ their trailing weekly average."
            csvFilename="waste-spikes.csv"
            emptyMessage="No waste spikes this week."
            {...tableData(wasteSpikes, (r) => r.itemId, [
              { key: "itemName", header: "Item", cell: (r) => cell(r.itemName) },
              {
                key: "currentWeekQuantity",
                header: "This week",
                cell: (r) => cell(`${r.currentWeekQuantity} ${r.unit}`, r.currentWeekQuantity),
              },
              {
                key: "trailingWeeklyAverage",
                header: "Trailing weekly avg.",
                cell: (r) => cell(`${r.trailingWeeklyAverage.toFixed(1)} ${r.unit}`, Number(r.trailingWeeklyAverage.toFixed(1))),
              },
              { key: "ratio", header: "Ratio", cell: (r) => cell(`${r.ratio.toFixed(1)}x`, Number(r.ratio.toFixed(1))) },
            ])}
          />

          {canViewRewards ? (
            <ReportTable
              title="Pending reward claims"
              csvFilename="pending-reward-claims.csv"
              emptyMessage="No pending reward claims."
              {...tableData(pendingClaims, (c) => c.id, [
                { key: "user", header: "Claimed by", cell: (c) => cell(profileNameById.get(c.user_id) ?? "Unknown") },
                { key: "reward", header: "Reward", cell: (c) => cell(rewardNameById.get(c.reward_id) ?? "Unknown reward") },
                { key: "cost", header: "Cost", format: "number", cell: (c) => cell(c.cost) },
                { key: "claimed_at", header: "Claimed", format: "datetime", cell: (c) => cell(c.claimed_at) },
              ])}
            />
          ) : (
            <LockedSection title="Pending reward claims" requires="rewards.fulfill or rewards.manage" />
          )}

          {canViewAccountability ? (
            <ReportTable
              title="Employees near disciplinary thresholds"
              csvFilename="near-disciplinary-thresholds.csv"
              emptyMessage="No employees are near a disciplinary threshold."
              {...tableData(nearThreshold, (r) => r.userId, [
                { key: "user", header: "Employee", cell: (r) => cell(profileNameById.get(r.userId) ?? "Unknown") },
                { key: "activePoints", header: "Active points", format: "number", cell: (r) => cell(r.activePoints) },
                { key: "nextThreshold", header: "Next threshold", cell: (r) => cell(r.nextThreshold.name) },
                { key: "pointsToNextThreshold", header: "Points to go", format: "number", cell: (r) => cell(r.pointsToNextThreshold) },
              ])}
            />
          ) : (
            <LockedSection title="Employees near disciplinary thresholds" requires="accountability.manage" />
          )}

          <ReportTable
            title="Open / overdue work orders"
            csvFilename="open-overdue-work-orders.csv"
            emptyMessage="No open work orders."
            {...tableData(openOrOverdueWorkOrders, (w) => w.id, [
              { key: "title", header: "Work order", cell: (w) => cell(w.title) },
              { key: "status", header: "Status", format: "badge", cell: (w) => cell(w.status) },
              { key: "priority", header: "Priority", cell: (w) => cell(w.priority) },
              { key: "overdue", header: "Overdue", format: "overdue", cell: (w) => cell(w.overdue) },
              { key: "due_at", header: "Due", format: "datetime", cell: (w) => cell(w.due_at) },
            ])}
          />

          <ReportTable
            title="Down equipment"
            csvFilename="down-equipment.csv"
            emptyMessage="No equipment is down."
            {...tableData(downEquipment, (e) => e.id, [
              { key: "name", header: "Equipment", cell: (e) => cell(e.name) },
              { key: "area", header: "Area", cell: (e) => cell(e.area ?? "—") },
            ])}
          />

          {canViewCatering ? (
            <ReportTable
              title="Catering follow-ups due"
              csvFilename="catering-followups-due.csv"
              emptyMessage="No catering follow-ups due."
              {...tableData(cateringFollowUpsDue, (f) => f.id, [
                {
                  key: "order",
                  header: "Order",
                  cell: (f) => cell(cateringOrderById.get(f.order_id)?.guest_name ?? "Unknown order"),
                },
                { key: "due_on", header: "Due", format: "date", cell: (f) => cell(f.due_on) },
              ])}
            />
          ) : (
            <LockedSection title="Catering follow-ups due" requires="catering.view or catering.manage" />
          )}
        </TabsContent>

        <TabsContent value="checklists" className="flex flex-col gap-4">
          {canViewChecklistReports ? (
            <>
              <ReportTable
                title="Checklist completion & failures by template"
                csvFilename="checklist-completion.csv"
                emptyMessage="No checklist runs yet."
                {...tableData(checklistCompletion, (r) => r.templateId, [
                  { key: "template", header: "Template", cell: (r) => cell(r.templateName) },
                  { key: "totalRuns", header: "Runs", format: "number", cell: (r) => cell(r.totalRuns) },
                  { key: "completedRuns", header: "Completed", format: "number", cell: (r) => cell(r.completedRuns) },
                  { key: "missedRuns", header: "Missed", format: "number", cell: (r) => cell(r.missedRuns) },
                  { key: "completionRate", header: "Completion rate", format: "percent", cell: (r) => cell(r.completionRate) },
                  { key: "flaggedAnswers", header: "Flagged answers", format: "number", cell: (r) => cell(r.flaggedAnswers) },
                ])}
              />
              <ReportTable
                title="Open follow-ups (failures)"
                csvFilename="checklist-open-followups.csv"
                emptyMessage="No open follow-ups."
                {...tableData(openFollowUps, (f) => f.id, followUpColumns())}
              />
            </>
          ) : (
            <LockedSection title="Checklist reports" requires="checklists.view_reports" />
          )}
        </TabsContent>

        <TabsContent value="waste" className="flex flex-col gap-4">
          <WastePeriodReport entries={wasteEntries} items={wasteItems} categories={wasteCategories} />
        </TabsContent>

        <TabsContent value="accountability" className="flex flex-col gap-4">
          {canViewAccountability ? (
            <ReportTable
              title="Accountability summary"
              csvFilename="accountability-summary.csv"
              emptyMessage="No infractions on record."
              {...tableData(accountabilitySummary, (r) => r.userId, [
                { key: "user", header: "Employee", cell: (r) => cell(profileNameById.get(r.userId) ?? "Unknown") },
                { key: "activePoints", header: "Active points", format: "number", cell: (r) => cell(r.activePoints) },
                { key: "totalInfractions", header: "Lifetime infractions", format: "number", cell: (r) => cell(r.totalInfractions) },
              ])}
            />
          ) : (
            <LockedSection title="Accountability summary" requires="accountability.manage" />
          )}
        </TabsContent>

        <TabsContent value="tokens" className="flex flex-col gap-4">
          {canViewTokens ? (
            <ReportTable
              title="Token activity by employee"
              csvFilename="token-activity.csv"
              emptyMessage="No token activity recorded."
              {...tableData(tokenActivity, (r) => r.userId, [
                { key: "user", header: "Employee", cell: (r) => cell(profileNameById.get(r.userId) ?? "Unknown") },
                { key: "earned", header: "Earned", format: "number", cell: (r) => cell(r.earned) },
                { key: "spent", header: "Spent", format: "number", cell: (r) => cell(r.spent) },
                { key: "net", header: "Net", format: "number", cell: (r) => cell(r.net) },
                { key: "transactionCount", header: "Transactions", format: "number", cell: (r) => cell(r.transactionCount) },
              ])}
            />
          ) : (
            <LockedSection title="Token activity" requires="tokens.manage" />
          )}

          {canViewRewards ? (
            <Card>
              <CardHeader>
                <CardTitle>Reward claims summary</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-6 text-sm">
                <Stat label="Total claims" value={rewardClaimSummary?.totalClaims ?? 0} />
                <Stat label="Pending" value={rewardClaimSummary?.pending ?? 0} />
                <Stat label="Delivered" value={rewardClaimSummary?.delivered ?? 0} />
                <Stat label="Cancelled" value={rewardClaimSummary?.cancelled ?? 0} />
                <Stat label="Delivered cost" value={rewardClaimSummary?.totalCostDelivered ?? 0} />
              </CardContent>
            </Card>
          ) : (
            <LockedSection title="Reward claims summary" requires="rewards.fulfill or rewards.manage" />
          )}
        </TabsContent>

        <TabsContent value="maintenance" className="flex flex-col gap-4">
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
        </TabsContent>

        <TabsContent value="training" className="flex flex-col gap-4">
          {canViewTraining ? (
            <>
              <ReportTable
                title="Development passport completion"
                csvFilename="passport-completion.csv"
                emptyMessage="No passport enrollments yet."
                {...tableData(passportCompletion, (r) => r.passportId, [
                  { key: "passport", header: "Passport", cell: (r) => cell(r.passportName) },
                  { key: "totalEnrollments", header: "Enrollments", format: "number", cell: (r) => cell(r.totalEnrollments) },
                  { key: "stamped", header: "Stamped", format: "number", cell: (r) => cell(r.stamped) },
                  { key: "completionRate", header: "Completion rate", format: "percent", cell: (r) => cell(r.completionRate) },
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
                  { key: "graduationRate", header: "Graduation rate", format: "percent", cell: (r) => cell(r.graduationRate) },
                ])}
              />
            </>
          ) : (
            <LockedSection title="Training completion" requires="training.view" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
