/**
 * Pure aggregation helpers for the Reporting module (ARCHITECTURE.md
 * "Reporting"; PLAN.md P2 "Reporting agent"). Every function here is a plain
 * data transform -- no Supabase/Next imports -- so it can be unit-tested
 * without a DB and safely reused by both the store dashboard and the
 * per-module report tables in app/(app)/reports/page.tsx.
 *
 * This module reads across every other module's rows (that's the point of a
 * reporting module) but never writes to them -- see page.tsx, which only
 * ever issues `.select()` calls. Ownership per PLAN.md P2 item 2 is scoped to
 * app/(app)/reports/** and components/reports/** only; nothing here imports
 * another module's server actions or mutates another module's tables.
 *
 * Waste rollups (by item/category/period) are intentionally NOT
 * reimplemented here: app/(app)/waste/logic.ts (S5, already merged) already
 * exports well-tested pure `rollupByItem` / `rollupByCategory` /
 * `filterEntriesByPeriod` helpers built for exactly this reuse (the same
 * functions already back components/waste/waste-reports.tsx). Reporting
 * imports those read-only, pure functions rather than duplicating the
 * rollup logic -- see app/(app)/reports/page.tsx.
 */

// ---------------------------------------------------------------------
// Tasks: overdue to-dos
// ---------------------------------------------------------------------

export interface TaskForReportLike {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  assigned_user_id: string | null;
  assigned_position_id: string | null;
}

/**
 * A to-do counts as overdue for the dashboard if the nightly sweep
 * (app/(app)/tasks/overdue.ts) has already flipped it to "overdue", or if
 * it's still "pending" with a due_at in the past (the sweep hasn't run yet
 * today). Completed/cancelled tasks are never overdue regardless of due_at.
 */
export function isTaskOverdue(task: TaskForReportLike, now: Date): boolean {
  if (task.status === "overdue") return true;
  if (task.status !== "pending") return false;
  return task.due_at != null && new Date(task.due_at).getTime() < now.getTime();
}

export function selectOverdueTasks(
  tasks: TaskForReportLike[],
  now: Date = new Date(),
): TaskForReportLike[] {
  return tasks
    .filter((t) => isTaskOverdue(t, now))
    .sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? ""));
}

// ---------------------------------------------------------------------
// Checklists: flagged answers / follow-ups + completion & failure rollup
// ---------------------------------------------------------------------

export interface FollowUpForReportLike {
  id: string;
  description: string;
  status: string;
  due_at: string | null;
  assigned_to: string | null;
}

/** Open (unresolved) follow-ups spawned by flagged checklist answers. */
export function selectOpenFollowUps(
  followUps: FollowUpForReportLike[],
): FollowUpForReportLike[] {
  return followUps
    .filter((f) => f.status === "open")
    .sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? ""));
}

export interface ChecklistRunForReportLike {
  id: string;
  template_id: string;
  status: string;
}

export interface ChecklistTemplateForReportLike {
  id: string;
  name: string;
}

export interface ChecklistAnswerFlagForReportLike {
  run_id: string;
  flagged: boolean;
}

export interface ChecklistCompletionRow {
  templateId: string;
  templateName: string;
  totalRuns: number;
  completedRuns: number;
  missedRuns: number;
  /** completedRuns / totalRuns, 0 when there are no runs yet. */
  completionRate: number;
  flaggedAnswers: number;
}

/**
 * Per-template rollup of run completion and flagged-answer counts
 * (ARCHITECTURE.md "Reporting": "checklist completion & failures").
 */
export function computeChecklistCompletion(
  runs: ChecklistRunForReportLike[],
  templates: ChecklistTemplateForReportLike[],
  answers: ChecklistAnswerFlagForReportLike[],
): ChecklistCompletionRow[] {
  const templateNameById = new Map(templates.map((t) => [t.id, t.name]));

  const flaggedCountByRun = new Map<string, number>();
  for (const answer of answers) {
    if (!answer.flagged) continue;
    flaggedCountByRun.set(answer.run_id, (flaggedCountByRun.get(answer.run_id) ?? 0) + 1);
  }

  interface Bucket {
    total: number;
    completed: number;
    missed: number;
    flagged: number;
  }
  const byTemplate = new Map<string, Bucket>();

  for (const run of runs) {
    const bucket = byTemplate.get(run.template_id) ?? { total: 0, completed: 0, missed: 0, flagged: 0 };
    bucket.total += 1;
    if (run.status === "completed") bucket.completed += 1;
    if (run.status === "missed") bucket.missed += 1;
    bucket.flagged += flaggedCountByRun.get(run.id) ?? 0;
    byTemplate.set(run.template_id, bucket);
  }

  return [...byTemplate.entries()]
    .map(([templateId, b]) => ({
      templateId,
      templateName: templateNameById.get(templateId) ?? "Unknown template",
      totalRuns: b.total,
      completedRuns: b.completed,
      missedRuns: b.missed,
      completionRate: b.total > 0 ? b.completed / b.total : 0,
      flaggedAnswers: b.flagged,
    }))
    .sort((a, b) => b.totalRuns - a.totalRuns);
}

// ---------------------------------------------------------------------
// Waste spikes (dashboard tile)
// ---------------------------------------------------------------------

export interface WasteEntryForSpikeLike {
  id: string;
  itemId: string;
  quantity: number;
  loggedAt: string;
}

export interface WasteItemForSpikeLike {
  id: string;
  name: string;
  unit: string;
}

export interface WasteSpikeRow {
  itemId: string;
  itemName: string;
  unit: string;
  currentWeekQuantity: number;
  trailingWeeklyAverage: number;
  ratio: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Flags items whose current-week logged quantity is at least `multiplier`x
 * the trailing weekly average of the previous `lookbackWeeks` weeks
 * (ARCHITECTURE.md "Reporting": "waste spikes"; the exact multiplier/lookback
 * aren't specified there, so `1.5x` over a `4`-week trailing average is a
 * SEED-DEFAULT, tunable via the options bag).
 *
 * Quantity (not cost) is the spike metric, since waste_items.unit_cost is
 * optional (waste/logic.ts's own rollups already treat a missing cost as
 * "unknown," not zero) -- a quantity-based spike still fires for items that
 * have never been priced. Items with no baseline activity in the lookback
 * window are never flagged: there's nothing to compare against, so a first-
 * ever entry isn't a "spike," it's just new data.
 */
export function findWasteSpikes(
  entries: WasteEntryForSpikeLike[],
  items: WasteItemForSpikeLike[],
  now: Date = new Date(),
  { lookbackWeeks = 4, multiplier = 1.5 }: { lookbackWeeks?: number; multiplier?: number } = {},
): WasteSpikeRow[] {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const currentWeekStart = now.getTime() - WEEK_MS;
  const baselineStart = currentWeekStart - lookbackWeeks * WEEK_MS;

  const currentByItem = new Map<string, number>();
  const baselineByItem = new Map<string, number>();

  for (const entry of entries) {
    const loggedAt = new Date(entry.loggedAt).getTime();
    if (Number.isNaN(loggedAt) || loggedAt > now.getTime()) continue;

    if (loggedAt >= currentWeekStart) {
      currentByItem.set(entry.itemId, (currentByItem.get(entry.itemId) ?? 0) + entry.quantity);
    } else if (loggedAt >= baselineStart) {
      baselineByItem.set(entry.itemId, (baselineByItem.get(entry.itemId) ?? 0) + entry.quantity);
    }
  }

  const rows: WasteSpikeRow[] = [];
  for (const [itemId, currentWeekQuantity] of currentByItem) {
    const baselineTotal = baselineByItem.get(itemId) ?? 0;
    if (baselineTotal <= 0) continue; // no baseline: can't call it a spike
    const trailingWeeklyAverage = baselineTotal / lookbackWeeks;
    if (trailingWeeklyAverage <= 0) continue;

    const ratio = currentWeekQuantity / trailingWeeklyAverage;
    if (ratio < multiplier) continue;

    const item = itemById.get(itemId);
    rows.push({
      itemId,
      itemName: item?.name ?? "Unknown item",
      unit: item?.unit ?? "",
      currentWeekQuantity,
      trailingWeeklyAverage,
      ratio,
    });
  }

  return rows.sort((a, b) => b.ratio - a.ratio);
}

// ---------------------------------------------------------------------
// Rewards: pending claims + activity summary
// ---------------------------------------------------------------------

export interface RewardClaimForReportLike {
  id: string;
  user_id: string;
  reward_id: string;
  cost: number;
  status: string;
  claimed_at: string;
}

export function selectPendingRewardClaims(
  claims: RewardClaimForReportLike[],
): RewardClaimForReportLike[] {
  return claims
    .filter((c) => c.status === "pending")
    .sort((a, b) => a.claimed_at.localeCompare(b.claimed_at));
}

export interface RewardClaimSummary {
  totalClaims: number;
  pending: number;
  delivered: number;
  cancelled: number;
  totalCostDelivered: number;
}

/** Small stat block for the token/reward activity report. */
export function summarizeRewardClaims(claims: RewardClaimForReportLike[]): RewardClaimSummary {
  const summary: RewardClaimSummary = {
    totalClaims: claims.length,
    pending: 0,
    delivered: 0,
    cancelled: 0,
    totalCostDelivered: 0,
  };
  for (const claim of claims) {
    if (claim.status === "pending") summary.pending += 1;
    else if (claim.status === "delivered") {
      summary.delivered += 1;
      summary.totalCostDelivered += claim.cost;
    } else if (claim.status === "cancelled") summary.cancelled += 1;
  }
  return summary;
}

// ---------------------------------------------------------------------
// Tokens: activity summary (earned / spent per user)
// ---------------------------------------------------------------------

export interface TokenTransactionForReportLike {
  id: string;
  user_id: string;
  delta: number;
  kind: string;
  created_at: string;
}

export interface TokenActivityRow {
  userId: string;
  earned: number;
  spent: number;
  net: number;
  transactionCount: number;
}

/**
 * Per-user earned/spent/net token totals (ARCHITECTURE.md "Reporting":
 * "token/reward activity"). Ledger-only, mirroring lib/tokens/ledger.ts's
 * rule that a balance is always computed from token_transactions, never
 * stored -- this report reads the same append-only ledger, it just never
 * writes to it.
 */
export function summarizeTokenActivity(
  transactions: TokenTransactionForReportLike[],
): TokenActivityRow[] {
  const byUser = new Map<string, TokenActivityRow>();

  for (const tx of transactions) {
    const row = byUser.get(tx.user_id) ?? {
      userId: tx.user_id,
      earned: 0,
      spent: 0,
      net: 0,
      transactionCount: 0,
    };
    if (tx.delta > 0) row.earned += tx.delta;
    else row.spent += Math.abs(tx.delta);
    row.net += tx.delta;
    row.transactionCount += 1;
    byUser.set(tx.user_id, row);
  }

  return [...byUser.values()].sort((a, b) => b.net - a.net);
}

// ---------------------------------------------------------------------
// Accountability: near-threshold employees + summary
// ---------------------------------------------------------------------

export interface InfractionForReportLike {
  user_id: string;
  points: number;
  expires_at: string | null;
}

export interface DisciplinaryThresholdLike {
  id: string;
  name: string;
  threshold_points: number;
}

/**
 * Sums each user's still-active (non-expired) infraction points. Relies on
 * the `expires_at` value the accountability module already computed and
 * stored at issuance time (app/(app)/accountability/logic.ts
 * `computeExpiresAt`) rather than recomputing it from
 * `accountability_settings`, so a later settings change never silently
 * changes what already-issued infractions "should" have expired at.
 */
export function computeActivePointsByUser(
  infractions: InfractionForReportLike[],
  now: Date = new Date(),
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const infraction of infractions) {
    if (infraction.expires_at && new Date(infraction.expires_at).getTime() <= now.getTime()) {
      continue;
    }
    totals.set(infraction.user_id, (totals.get(infraction.user_id) ?? 0) + infraction.points);
  }
  return totals;
}

export interface NearThresholdRow {
  userId: string;
  activePoints: number;
  nextThreshold: DisciplinaryThresholdLike;
  pointsToNextThreshold: number;
}

/**
 * Employees within `withinPoints` of the next uncrossed rung on the
 * disciplinary ladder (ARCHITECTURE.md "Reporting": "employees near
 * disciplinary thresholds"). Employees who have already crossed every rung
 * already have a `disciplinary_actions` row from the accountability module's
 * own trigger -- this only surfaces people who are APPROACHING a threshold,
 * not people who already hit one. `withinPoints` default of 2 is a
 * SEED-DEFAULT (ARCHITECTURE.md doesn't specify a "near" cutoff).
 */
export function findEmployeesNearThreshold(
  pointsByUser: Map<string, number>,
  ladder: DisciplinaryThresholdLike[],
  { withinPoints = 2 }: { withinPoints?: number } = {},
): NearThresholdRow[] {
  const sortedLadder = [...ladder].sort((a, b) => a.threshold_points - b.threshold_points);
  const rows: NearThresholdRow[] = [];

  for (const [userId, activePoints] of pointsByUser) {
    const nextThreshold = sortedLadder.find((t) => t.threshold_points > activePoints);
    if (!nextThreshold) continue;

    const pointsToNextThreshold = nextThreshold.threshold_points - activePoints;
    if (pointsToNextThreshold <= withinPoints) {
      rows.push({ userId, activePoints, nextThreshold, pointsToNextThreshold });
    }
  }

  return rows.sort((a, b) => a.pointsToNextThreshold - b.pointsToNextThreshold);
}

export interface AccountabilitySummaryRow {
  userId: string;
  activePoints: number;
  totalInfractions: number;
}

/** Per-user active points + lifetime infraction count, for the accountability report tab. */
export function computeAccountabilitySummary(
  infractions: InfractionForReportLike[],
  now: Date = new Date(),
): AccountabilitySummaryRow[] {
  const activeByUser = computeActivePointsByUser(infractions, now);
  const countByUser = new Map<string, number>();
  for (const infraction of infractions) {
    countByUser.set(infraction.user_id, (countByUser.get(infraction.user_id) ?? 0) + 1);
  }

  const userIds = new Set([...activeByUser.keys(), ...countByUser.keys()]);
  return [...userIds]
    .map((userId) => ({
      userId,
      activePoints: activeByUser.get(userId) ?? 0,
      totalInfractions: countByUser.get(userId) ?? 0,
    }))
    .sort((a, b) => b.activePoints - a.activePoints);
}

// ---------------------------------------------------------------------
// Maintenance: open/overdue work orders + down equipment (dashboard tiles)
// ---------------------------------------------------------------------

export interface WorkOrderForReportLike {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
}

const TERMINAL_WORK_ORDER_STATUSES = new Set(["complete", "cancelled"]);

export interface WorkOrderReportRow extends WorkOrderForReportLike {
  overdue: boolean;
}

/** Every work order not yet complete/cancelled, flagged as overdue if due_at has passed. */
export function selectOpenOrOverdueWorkOrders(
  workOrders: WorkOrderForReportLike[],
  now: Date = new Date(),
): WorkOrderReportRow[] {
  return workOrders
    .filter((wo) => !TERMINAL_WORK_ORDER_STATUSES.has(wo.status))
    .map((wo) => ({
      ...wo,
      overdue: wo.due_at != null && new Date(wo.due_at).getTime() < now.getTime(),
    }))
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return (a.due_at ?? "").localeCompare(b.due_at ?? "");
    });
}

export interface EquipmentForReportLike {
  id: string;
  name: string;
  status: string;
  area: string | null;
}

export function selectDownEquipment(equipment: EquipmentForReportLike[]): EquipmentForReportLike[] {
  return equipment.filter((e) => e.status === "down").sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------
// Catering: follow-ups due (dashboard tile)
// ---------------------------------------------------------------------

export interface CateringFollowUpForReportLike {
  id: string;
  order_id: string;
  due_on: string | null;
  done_at: string | null;
}

/** Follow-up calls that are due (or overdue) and not yet marked done. */
export function selectCateringFollowUpsDue(
  followUps: CateringFollowUpForReportLike[],
  now: Date = new Date(),
): CateringFollowUpForReportLike[] {
  return followUps
    .filter((f) => f.done_at == null && f.due_on != null && new Date(f.due_on).getTime() <= now.getTime())
    .sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""));
}

// ---------------------------------------------------------------------
// Training: passport + trainee-lifecycle completion
// ---------------------------------------------------------------------

export interface PassportEnrollmentForReportLike {
  id: string;
  passport_id: string;
  stamped_at: string | null;
}

export interface PassportForReportLike {
  id: string;
  name: string;
}

export interface PassportCompletionRow {
  passportId: string;
  passportName: string;
  totalEnrollments: number;
  stamped: number;
  completionRate: number;
}

export function computePassportCompletion(
  enrollments: PassportEnrollmentForReportLike[],
  passports: PassportForReportLike[],
): PassportCompletionRow[] {
  const nameById = new Map(passports.map((p) => [p.id, p.name]));

  interface Bucket {
    total: number;
    stamped: number;
  }
  const byPassport = new Map<string, Bucket>();

  for (const enrollment of enrollments) {
    const bucket = byPassport.get(enrollment.passport_id) ?? { total: 0, stamped: 0 };
    bucket.total += 1;
    if (enrollment.stamped_at != null) bucket.stamped += 1;
    byPassport.set(enrollment.passport_id, bucket);
  }

  return [...byPassport.entries()]
    .map(([passportId, b]) => ({
      passportId,
      passportName: nameById.get(passportId) ?? "Unknown passport",
      totalEnrollments: b.total,
      stamped: b.stamped,
      completionRate: b.total > 0 ? b.stamped / b.total : 0,
    }))
    .sort((a, b) => b.totalEnrollments - a.totalEnrollments);
}

export interface TraineeEnrollmentForReportLike {
  id: string;
  roadmap_id: string;
  status: string;
}

export interface RoadmapForReportLike {
  id: string;
  name: string;
}

export interface TraineeCompletionRow {
  roadmapId: string;
  roadmapName: string;
  total: number;
  active: number;
  graduated: number;
  pip: number;
  graduationRate: number;
}

/** Per-roadmap trainee status counts (active / graduated / pip) and graduation rate. */
export function computeTraineeCompletion(
  enrollments: TraineeEnrollmentForReportLike[],
  roadmaps: RoadmapForReportLike[],
): TraineeCompletionRow[] {
  const nameById = new Map(roadmaps.map((r) => [r.id, r.name]));

  interface Bucket {
    total: number;
    active: number;
    graduated: number;
    pip: number;
  }
  const byRoadmap = new Map<string, Bucket>();

  for (const enrollment of enrollments) {
    const bucket = byRoadmap.get(enrollment.roadmap_id) ?? { total: 0, active: 0, graduated: 0, pip: 0 };
    bucket.total += 1;
    if (enrollment.status === "active") bucket.active += 1;
    else if (enrollment.status === "graduated") bucket.graduated += 1;
    else if (enrollment.status === "pip") bucket.pip += 1;
    byRoadmap.set(enrollment.roadmap_id, bucket);
  }

  return [...byRoadmap.entries()]
    .map(([roadmapId, b]) => ({
      roadmapId,
      roadmapName: nameById.get(roadmapId) ?? "Unknown roadmap",
      total: b.total,
      active: b.active,
      graduated: b.graduated,
      pip: b.pip,
      graduationRate: b.total > 0 ? b.graduated / b.total : 0,
    }))
    .sort((a, b) => b.total - a.total);
}
