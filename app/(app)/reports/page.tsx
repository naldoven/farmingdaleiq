import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LockedSection } from "@/components/reports/locked-section";
import { ReportTable } from "@/components/reports/report-table";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  filterEntriesByPeriod,
  rollupByCategory,
  rollupByItem,
  type WasteCategoryForRollup,
  type WasteEntryForRollup,
  type WasteItemForRollup,
} from "@/app/(app)/waste/logic";
import {
  computeAccountabilitySummary,
  computeActivePointsByUser,
  computeChecklistCompletion,
  computePassportCompletion,
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
 */
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
  const wasteFiltered = filterEntriesByPeriod(wasteEntries, "month", now);
  const wasteByItem = rollupByItem(wasteFiltered, wasteItems);
  const wasteByCategory = rollupByCategory(wasteFiltered, wasteItems, wasteCategories);
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
          <TabsTrigger value="training">Training</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="flex flex-col gap-4">
          <ReportTable
            title="Overdue to-dos"
            columns={[
              { key: "title", header: "Task", render: (t) => t.title },
              {
                key: "assignee",
                header: "Assigned to",
                render: (t) =>
                  t.assigned_user_id
                    ? (profileNameById.get(t.assigned_user_id) ?? "Unknown")
                    : t.assigned_position_id
                      ? `${positionNameById.get(t.assigned_position_id) ?? "Unknown position"} (position)`
                      : "Unassigned",
              },
              { key: "due_at", header: "Due", render: (t) => formatDateTime(t.due_at) },
            ]}
            rows={overdueTasks}
            rowKey={(t) => t.id}
            csvFilename="overdue-tasks.csv"
            emptyMessage="No overdue to-dos."
          />

          {canViewChecklistReports ? (
            <ReportTable
              title="Flagged checklist answers"
              description="Open follow-ups spawned by a flagged or out-of-range answer."
              columns={[
                { key: "description", header: "Follow-up", render: (f) => f.description },
                {
                  key: "assigned_to",
                  header: "Assigned to",
                  render: (f) => (f.assigned_to ? (profileNameById.get(f.assigned_to) ?? "Unknown") : "Unassigned"),
                },
                { key: "due_at", header: "Due", render: (f) => formatDateTime(f.due_at) },
              ]}
              rows={openFollowUps}
              rowKey={(f) => f.id}
              csvFilename="flagged-checklist-answers.csv"
              emptyMessage="No open follow-ups."
            />
          ) : (
            <LockedSection title="Flagged checklist answers" requires="checklists.view_reports" />
          )}

          <ReportTable
            title="Waste spikes"
            description="Items logged this week at 1.5x+ their trailing 4-week weekly average."
            columns={[
              { key: "itemName", header: "Item", render: (r) => r.itemName },
              { key: "currentWeekQuantity", header: "This week", render: (r) => `${r.currentWeekQuantity} ${r.unit}` },
              {
                key: "trailingWeeklyAverage",
                header: "Trailing weekly avg.",
                render: (r) => `${r.trailingWeeklyAverage.toFixed(1)} ${r.unit}`,
              },
              { key: "ratio", header: "Ratio", render: (r) => `${r.ratio.toFixed(1)}x` },
            ]}
            rows={wasteSpikes}
            rowKey={(r) => r.itemId}
            csvFilename="waste-spikes.csv"
            emptyMessage="No waste spikes this week."
          />

          {canViewRewards ? (
            <ReportTable
              title="Pending reward claims"
              columns={[
                {
                  key: "user",
                  header: "Claimed by",
                  render: (c) => profileNameById.get(c.user_id) ?? "Unknown",
                },
                { key: "reward", header: "Reward", render: (c) => rewardNameById.get(c.reward_id) ?? "Unknown reward" },
                { key: "cost", header: "Cost", render: (c) => c.cost },
                { key: "claimed_at", header: "Claimed", render: (c) => formatDateTime(c.claimed_at) },
              ]}
              rows={pendingClaims}
              rowKey={(c) => c.id}
              csvFilename="pending-reward-claims.csv"
              emptyMessage="No pending reward claims."
            />
          ) : (
            <LockedSection title="Pending reward claims" requires="rewards.fulfill or rewards.manage" />
          )}

          {canViewAccountability ? (
            <ReportTable
              title="Employees near disciplinary thresholds"
              columns={[
                { key: "user", header: "Employee", render: (r) => profileNameById.get(r.userId) ?? "Unknown" },
                { key: "activePoints", header: "Active points", render: (r) => r.activePoints },
                { key: "nextThreshold", header: "Next threshold", render: (r) => r.nextThreshold.name },
                { key: "pointsToNextThreshold", header: "Points to go", render: (r) => r.pointsToNextThreshold },
              ]}
              rows={nearThreshold}
              rowKey={(r) => r.userId}
              csvFilename="near-disciplinary-thresholds.csv"
              emptyMessage="No employees are near a disciplinary threshold."
            />
          ) : (
            <LockedSection title="Employees near disciplinary thresholds" requires="accountability.manage" />
          )}

          <ReportTable
            title="Open / overdue work orders"
            columns={[
              { key: "title", header: "Work order", render: (w) => w.title },
              { key: "status", header: "Status", render: (w) => <Badge variant="outline">{w.status.replace("_", " ")}</Badge>, csvValue: (w) => w.status },
              { key: "priority", header: "Priority", render: (w) => w.priority },
              {
                key: "overdue",
                header: "Overdue",
                render: (w) => (w.overdue ? <Badge variant="destructive">Overdue</Badge> : "—"),
                csvValue: (w) => (w.overdue ? "yes" : "no"),
              },
              { key: "due_at", header: "Due", render: (w) => formatDateTime(w.due_at) },
            ]}
            rows={openOrOverdueWorkOrders}
            rowKey={(w) => w.id}
            csvFilename="open-overdue-work-orders.csv"
            emptyMessage="No open work orders."
          />

          <ReportTable
            title="Down equipment"
            columns={[
              { key: "name", header: "Equipment", render: (e) => e.name },
              { key: "area", header: "Area", render: (e) => e.area ?? "—" },
            ]}
            rows={downEquipment}
            rowKey={(e) => e.id}
            csvFilename="down-equipment.csv"
            emptyMessage="No equipment is down."
          />

          {canViewCatering ? (
            <ReportTable
              title="Catering follow-ups due"
              columns={[
                {
                  key: "order",
                  header: "Order",
                  render: (f) => cateringOrderById.get(f.order_id)?.guest_name ?? "Unknown order",
                },
                { key: "due_on", header: "Due", render: (f) => formatDate(f.due_on) },
              ]}
              rows={cateringFollowUpsDue}
              rowKey={(f) => f.id}
              csvFilename="catering-followups-due.csv"
              emptyMessage="No catering follow-ups due."
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
                columns={[
                  { key: "template", header: "Template", render: (r) => r.templateName },
                  { key: "totalRuns", header: "Runs", render: (r) => r.totalRuns },
                  { key: "completedRuns", header: "Completed", render: (r) => r.completedRuns },
                  { key: "missedRuns", header: "Missed", render: (r) => r.missedRuns },
                  {
                    key: "completionRate",
                    header: "Completion rate",
                    render: (r) => `${(r.completionRate * 100).toFixed(0)}%`,
                    csvValue: (r) => Math.round(r.completionRate * 100),
                  },
                  { key: "flaggedAnswers", header: "Flagged answers", render: (r) => r.flaggedAnswers },
                ]}
                rows={checklistCompletion}
                rowKey={(r) => r.templateId}
                csvFilename="checklist-completion.csv"
                emptyMessage="No checklist runs yet."
              />
              <ReportTable
                title="Open follow-ups (failures)"
                columns={[
                  { key: "description", header: "Follow-up", render: (f) => f.description },
                  {
                    key: "assigned_to",
                    header: "Assigned to",
                    render: (f) => (f.assigned_to ? (profileNameById.get(f.assigned_to) ?? "Unknown") : "Unassigned"),
                  },
                  { key: "due_at", header: "Due", render: (f) => formatDateTime(f.due_at) },
                ]}
                rows={openFollowUps}
                rowKey={(f) => f.id}
                csvFilename="checklist-open-followups.csv"
                emptyMessage="No open follow-ups."
              />
            </>
          ) : (
            <LockedSection title="Checklist reports" requires="checklists.view_reports" />
          )}
        </TabsContent>

        <TabsContent value="waste" className="flex flex-col gap-4">
          <ReportTable
            title="Waste by item (last 30 days)"
            columns={[
              { key: "itemName", header: "Item", render: (r) => r.itemName },
              { key: "entryCount", header: "Entries", render: (r) => r.entryCount },
              { key: "totalQuantity", header: "Total quantity", render: (r) => `${r.totalQuantity} ${r.unit}` },
              {
                key: "totalCost",
                header: "Est. cost",
                render: (r) => (r.totalCost != null ? `$${r.totalCost.toFixed(2)}` : "—"),
                csvValue: (r) => r.totalCost,
              },
            ]}
            rows={wasteByItem}
            rowKey={(r) => r.itemId}
            csvFilename="waste-by-item.csv"
            emptyMessage="No waste logged in the last 30 days."
          />
          <ReportTable
            title="Waste by category (last 30 days)"
            columns={[
              { key: "categoryName", header: "Category", render: (r) => r.categoryName },
              { key: "entryCount", header: "Entries", render: (r) => r.entryCount },
              {
                key: "totalCost",
                header: "Est. cost",
                render: (r) => (r.totalCost != null ? `$${r.totalCost.toFixed(2)}` : "—"),
                csvValue: (r) => r.totalCost,
              },
            ]}
            rows={wasteByCategory}
            rowKey={(r) => r.categoryId ?? "uncategorized"}
            csvFilename="waste-by-category.csv"
            emptyMessage="No waste logged in the last 30 days."
          />
        </TabsContent>

        <TabsContent value="accountability" className="flex flex-col gap-4">
          {canViewAccountability ? (
            <ReportTable
              title="Accountability summary"
              columns={[
                { key: "user", header: "Employee", render: (r) => profileNameById.get(r.userId) ?? "Unknown" },
                { key: "activePoints", header: "Active points", render: (r) => r.activePoints },
                { key: "totalInfractions", header: "Lifetime infractions", render: (r) => r.totalInfractions },
              ]}
              rows={accountabilitySummary}
              rowKey={(r) => r.userId}
              csvFilename="accountability-summary.csv"
              emptyMessage="No infractions on record."
            />
          ) : (
            <LockedSection title="Accountability summary" requires="accountability.manage" />
          )}
        </TabsContent>

        <TabsContent value="tokens" className="flex flex-col gap-4">
          {canViewTokens ? (
            <ReportTable
              title="Token activity by employee"
              columns={[
                { key: "user", header: "Employee", render: (r) => profileNameById.get(r.userId) ?? "Unknown" },
                { key: "earned", header: "Earned", render: (r) => r.earned },
                { key: "spent", header: "Spent", render: (r) => r.spent },
                { key: "net", header: "Net", render: (r) => r.net },
                { key: "transactionCount", header: "Transactions", render: (r) => r.transactionCount },
              ]}
              rows={tokenActivity}
              rowKey={(r) => r.userId}
              csvFilename="token-activity.csv"
              emptyMessage="No token activity recorded."
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

        <TabsContent value="training" className="flex flex-col gap-4">
          {canViewTraining ? (
            <>
              <ReportTable
                title="Development passport completion"
                columns={[
                  { key: "passport", header: "Passport", render: (r) => r.passportName },
                  { key: "totalEnrollments", header: "Enrollments", render: (r) => r.totalEnrollments },
                  { key: "stamped", header: "Stamped", render: (r) => r.stamped },
                  {
                    key: "completionRate",
                    header: "Completion rate",
                    render: (r) => `${(r.completionRate * 100).toFixed(0)}%`,
                    csvValue: (r) => Math.round(r.completionRate * 100),
                  },
                ]}
                rows={passportCompletion}
                rowKey={(r) => r.passportId}
                csvFilename="passport-completion.csv"
                emptyMessage="No passport enrollments yet."
              />
              <ReportTable
                title="Trainee lifecycle completion"
                columns={[
                  { key: "roadmap", header: "Roadmap", render: (r) => r.roadmapName },
                  { key: "total", header: "Enrolled", render: (r) => r.total },
                  { key: "active", header: "Active", render: (r) => r.active },
                  { key: "graduated", header: "Graduated", render: (r) => r.graduated },
                  { key: "pip", header: "PIP", render: (r) => r.pip },
                  {
                    key: "graduationRate",
                    header: "Graduation rate",
                    render: (r) => `${(r.graduationRate * 100).toFixed(0)}%`,
                    csvValue: (r) => Math.round(r.graduationRate * 100),
                  },
                ]}
                rows={traineeCompletion}
                rowKey={(r) => r.roadmapId}
                csvFilename="trainee-completion.csv"
                emptyMessage="No trainee enrollments yet."
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

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}
