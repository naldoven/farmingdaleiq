import { LockedSection } from "@/components/reports/locked-section";
import { ReportTable } from "@/components/reports/report-table";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

import {
  computeActivePointsByUser,
  findEmployeesNearThreshold,
  findWasteSpikes,
  selectCateringFollowUpsDue,
  selectDownEquipment,
  selectOpenFollowUps,
  selectOpenOrOverdueWorkOrders,
  selectOverdueTasks,
  selectPendingRewardClaims,
} from "../logic";
import {
  fetchAccountabilityReportData,
  fetchBaseReportData,
  fetchCateringReportData,
  fetchChecklistReportData,
  fetchRewardReportData,
} from "../queries";
import { assigneeLabelFactory, cell, followUpColumns, tableData } from "../table-helpers";

/**
 * /reports/overview -- the cross-module rollup the old /reports "Dashboard"
 * tab showed: overdue to-dos, flagged checklist answers, waste spikes,
 * pending reward claims, employees near a disciplinary threshold, open/
 * overdue work orders, down equipment, and catering follow-ups due. Every
 * query and pure computation here is unchanged from that tab; only the
 * layout (one route instead of one Tabs panel) and the card styling moved.
 */
export default async function ReportsOverviewPage() {
  await requirePermission("reports.view");

  const supabase = await createClient();
  const now = new Date();

  const [
    canViewChecklistReports,
    canViewAccountability,
    canViewFulfillClaims,
    canViewManageClaims,
    canViewCateringA,
    canViewCateringB,
  ] = await Promise.all([
    hasPermission("checklists.view_reports"),
    hasPermission("accountability.manage"),
    hasPermission("rewards.fulfill"),
    hasPermission("rewards.manage"),
    hasPermission("catering.view"),
    hasPermission("catering.manage"),
  ]);
  const canViewRewards = canViewFulfillClaims || canViewManageClaims;
  const canViewCatering = canViewCateringA || canViewCateringB;

  const base = await fetchBaseReportData(supabase);
  const checklistData = canViewChecklistReports ? await fetchChecklistReportData(supabase) : null;
  const accountabilityData = canViewAccountability ? await fetchAccountabilityReportData(supabase) : null;
  const rewardData = canViewRewards ? await fetchRewardReportData(supabase) : null;
  const cateringData = canViewCatering ? await fetchCateringReportData(supabase) : null;

  const profileNameById = new Map(base.profiles.map((p) => [p.id, p.name]));
  const positionNameById = new Map(base.positions.map((p) => [p.id, p.name]));
  const assigneeLabel = assigneeLabelFactory(profileNameById, positionNameById);

  const overdueTasks = selectOverdueTasks(base.tasks, now);
  const openFollowUps = checklistData ? selectOpenFollowUps(checklistData.followUps) : [];
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
  const rewardNameById = new Map((rewardData?.rewards ?? []).map((r) => [r.id, r.name]));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h2 className="text-[22px] font-bold text-ink">Overview</h2>
        <p className="text-[13px] text-muted-ink">
          Cross-module alerts: overdue to-dos, waste spikes, work orders, and more.
        </p>
      </div>

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
          {...tableData(openFollowUps, (f) => f.id, followUpColumns(profileNameById))}
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
            cell: (r) =>
              cell(`${r.trailingWeeklyAverage.toFixed(1)} ${r.unit}`, Number(r.trailingWeeklyAverage.toFixed(1))),
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
            {
              key: "reward",
              header: "Reward",
              cell: (c) => cell(rewardNameById.get(c.reward_id) ?? "Unknown reward"),
            },
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
            {
              key: "pointsToNextThreshold",
              header: "Points to go",
              format: "number",
              cell: (r) => cell(r.pointsToNextThreshold),
            },
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
    </div>
  );
}
