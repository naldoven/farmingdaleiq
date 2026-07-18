import Link from "next/link";
import { ClipboardCheck, Coins } from "lucide-react";

import {
  HScroll,
  ListRow,
  MetricCard,
  SectionCard,
  StatTile,
  StatusBadge,
} from "@/components/mobile";
import { transactionKindLabel } from "@/app/(app)/tokens/logic";
import { createClient } from "@/lib/supabase/server";
import { getBalance, getRecentTransactions } from "@/lib/tokens/ledger";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface HomeTaskSummary {
  openCount: number;
  overdueCount: number;
  titles: string[];
}

export interface CompletionSummary {
  completed: number;
  total: number;
  pct: number;
}

export interface TaskScopeSummary {
  assigned: number;
  overdue: number;
}

export interface ActivitySummary {
  unreadCount: number;
  priorityCount: number;
}

export interface HomeTokenActivityRow {
  id: string;
  label: string;
  delta: number;
}

const OPEN_TASK_STATUSES = new Set(["pending", "overdue"]);

/**
 * Notification kinds surfaced as "priority" on the home Activity card: the
 * ones a person is personally affected by and should not miss (a subset of
 * NOTIFIABLE_EVENT_KEYS, lib/notify/templates.ts). Purely a display grouping
 * for this card, not a delivery or permission rule.
 */
export const PRIORITY_NOTIFICATION_KINDS = new Set([
  "infraction_issued",
  "disciplinary_triggered",
  "follow_up_assigned",
  "reward_claim",
]);

/** Pure task-summary builder for the "To-Dos Today" card (FIQ parity R27). */
export function summarizeTasks(
  tasks: { title: string; status: string }[],
): HomeTaskSummary {
  const open = tasks.filter((t) => OPEN_TASK_STATUSES.has(t.status));
  return {
    openCount: open.length,
    overdueCount: tasks.filter((t) => t.status === "overdue").length,
    titles: open.slice(0, 3).map((t) => t.title),
  };
}

/**
 * Pure x/y + "% Completed" summarizer shared by the Checklists and Tasks
 * scoreboard tiles: how many of today's items are in `completedStatus`.
 */
export function summarizeCompletion(
  statuses: string[],
  completedStatus = "completed",
): CompletionSummary {
  const total = statuses.length;
  const completed = statuses.filter((s) => s === completedStatus).length;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, pct };
}

/** Pure "assigned / overdue" counter for the Assigned Tasks card's tiles. */
export function summarizeTaskScope(tasks: { status: string }[]): TaskScopeSummary {
  const open = tasks.filter((t) => OPEN_TASK_STATUSES.has(t.status));
  return {
    assigned: open.length,
    overdue: open.filter((t) => t.status === "overdue").length,
  };
}

/** Counts the signed-in user's own not-yet-acknowledged disciplinary actions. */
export function countActiveDisciplinaryActions(actions: { status: string }[]): number {
  return actions.filter((a) => a.status === "pending").length;
}

/** Unread / priority-unread counts for the home Activity card. */
export function summarizeActivity(
  notifications: { kind: string; read_at: string | null }[],
): ActivitySummary {
  const unread = notifications.filter((n) => n.read_at === null);
  return {
    unreadCount: unread.length,
    priorityCount: unread.filter((n) => PRIORITY_NOTIFICATION_KINDS.has(n.kind)).length,
  };
}

/** Formats recent token_transactions for the home Tokens card's short list. */
export function summarizeTokenActivity(
  transactions: { id: string; delta: number; kind: string; note: string | null }[],
): HomeTokenActivityRow[] {
  return transactions.map((t) => ({
    id: t.id,
    label: t.note && t.note.trim().length > 0 ? t.note : transactionKindLabel(t.kind),
    delta: t.delta,
  }));
}

/**
 * / (owned by the app-group -- FIQ parity R2). KitchenIQ-style home
 * dashboard: a scoreboard (checklists, active DAs, tasks), today's to-dos,
 * an activity summary, assigned-tasks tiles (to you / by you), and the
 * token balance with recent ledger activity. The AppShell (mounted by
 * app/(app)/layout.tsx) renders the home header/nav; this page only supplies
 * the content column.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let checklists: CompletionSummary = { completed: 0, total: 0, pct: 0 };
  let activeDAs = 0;
  let tasksCompletion: CompletionSummary = { completed: 0, total: 0, pct: 0 };
  let todos: HomeTaskSummary = { openCount: 0, overdueCount: 0, titles: [] };
  let activity: ActivitySummary = { unreadCount: 0, priorityCount: 0 };
  let toYou: TaskScopeSummary = { assigned: 0, overdue: 0 };
  let byYou: TaskScopeSummary = { assigned: 0, overdue: 0 };
  let balance = 0;
  let tokenActivity: HomeTokenActivityRow[] = [];

  if (user) {
    const today = todayIso();

    const [
      { data: checklistRuns },
      { data: disciplinaryActions },
      { data: tasksToday },
      { data: notifications },
      balanceResult,
      recentTransactions,
    ] = await Promise.all([
      supabase.from("checklist_runs").select("status").eq("run_date", today),
      supabase.from("disciplinary_actions").select("status").eq("user_id", user.id),
      supabase
        .from("tasks")
        .select("title, status, assigned_user_id, created_by")
        .eq("date", today),
      supabase.from("notifications").select("kind, read_at").eq("user_id", user.id),
      getBalance(user.id, supabase),
      getRecentTransactions(user.id, 5, supabase),
    ]);

    checklists = summarizeCompletion((checklistRuns ?? []).map((r) => r.status));
    activeDAs = countActiveDisciplinaryActions(disciplinaryActions ?? []);

    const activeTasks = (tasksToday ?? []).filter((t) => t.status !== "cancelled");
    tasksCompletion = summarizeCompletion(activeTasks.map((t) => t.status));

    const assignedToMe = activeTasks.filter((t) => t.assigned_user_id === user.id);
    const createdByMe = activeTasks.filter((t) => t.created_by === user.id);
    todos = summarizeTasks(assignedToMe);
    toYou = summarizeTaskScope(assignedToMe);
    byYou = summarizeTaskScope(createdByMe);

    activity = summarizeActivity(notifications ?? []);
    balance = balanceResult;
    tokenActivity = summarizeTokenActivity(recentTransactions ?? []);
  }

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      {/* PWA-F3: the home screen's wordmark lives in the header as a <span>, so
          the content column had no top-level heading. This gives assistive tech
          a page-level h1 without changing the visual layout. */}
      <h1 className="sr-only">Home</h1>
      <HScroll>
        <MetricCard
          className="w-36"
          title="Checklists"
          value={`${checklists.completed}/${checklists.total}`}
          subline={`${checklists.pct}% Completed`}
        />
        <MetricCard
          className="w-36"
          title="Active DAs"
          value={<span className="text-danger">{activeDAs}</span>}
        />
        <MetricCard
          className="w-36"
          title="Tasks"
          value={`${tasksCompletion.completed}/${tasksCompletion.total}`}
          subline={`${tasksCompletion.pct}% Completed`}
        />
      </HScroll>

      <SectionCard title="To-Dos Today" expandHref="/tasks" flush={todos.openCount > 0}>
        {todos.openCount === 0 ? (
          <p className="text-[15px] text-muted-ink">No To-Dos due Today.</p>
        ) : (
          <div className="divide-y divide-line">
            {todos.titles.map((title, i) => (
              <ListRow key={i} icon={ClipboardCheck} iconTone="accent" title={title} />
            ))}
            {todos.overdueCount > 0 && (
              <div className="px-4 py-3">
                <StatusBadge tone="danger" dot>
                  {todos.overdueCount} overdue
                </StatusBadge>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Activity"
        action={
          <Link href="/notifications" className="text-[13px] font-semibold text-accent">
            View all
          </Link>
        }
      >
        <div className="flex gap-3">
          <StatTile
            className="flex-1"
            value={activity.priorityCount}
            label="Priority"
            tone={activity.priorityCount > 0 ? "danger" : "neutral"}
          />
          <StatTile
            className="flex-1"
            value={activity.unreadCount}
            label="Unread"
            tone={activity.unreadCount > 0 ? "warning" : "neutral"}
          />
        </div>
      </SectionCard>

      <SectionCard title="Assigned Tasks" expandHref="/tasks">
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-[13px] font-semibold text-muted-ink">To you</p>
            <div className="grid grid-cols-2 gap-3">
              <StatTile value={toYou.assigned} label="Assigned" />
              <StatTile
                value={toYou.overdue}
                label="Overdue"
                tone={toYou.overdue > 0 ? "danger" : "neutral"}
              />
            </div>
          </div>
          <div>
            <p className="mb-2 text-[13px] font-semibold text-muted-ink">By you</p>
            <div className="grid grid-cols-2 gap-3">
              <StatTile value={byYou.assigned} label="Assigned" />
              <StatTile
                value={byYou.overdue}
                label="Overdue"
                tone={byYou.overdue > 0 ? "danger" : "neutral"}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Tokens" expandHref="/tokens">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-warning-soft text-warning"
            >
              <Coins className="h-5 w-5" />
            </span>
            <span className="text-[30px] font-bold leading-none text-ink">{balance}</span>
          </div>
          {tokenActivity.length === 0 ? (
            <p className="text-[15px] text-muted-ink">No token activity yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-line">
              {tokenActivity.map((row) => (
                <div key={row.id} className="flex items-center justify-between py-2 text-[15px]">
                  <span className="text-ink">{row.label}</span>
                  <span
                    className={
                      row.delta >= 0
                        ? "font-semibold text-success"
                        : "font-semibold text-danger"
                    }
                  >
                    {row.delta >= 0 ? `+${row.delta}` : row.delta}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
