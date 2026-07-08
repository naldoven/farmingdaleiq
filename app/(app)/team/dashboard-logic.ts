/**
 * Pure summarizers for the /team daypart dashboard (KitchenIQ mobile
 * redesign, docs/DESIGN-SYSTEM.md). Dependency-free (no Supabase client) so
 * the To-Dos progress/"Due Soon" math and the Breaks scoreboard math are
 * unit-testable without a database, mirroring the pattern in
 * app/(app)/page.tsx (summarizePositions/summarizeTasks/summarizeFeed) and
 * app/(app)/waste/logic.ts.
 */

export interface DueSoonSource {
  id: string;
  kind: "task" | "checklist";
  title: string;
  /** ISO timestamp. Null when there's no due time to sort/show by. */
  dueAt: string | null;
  completed: boolean;
}

export interface ToDoSummary {
  totalCount: number;
  completedCount: number;
  /** 0-100, rounded. 0 when there are no items (nothing to divide by). */
  percentComplete: number;
  /** The soonest-due open items, up to `limit`. */
  dueSoon: DueSoonSource[];
  /** How many more open items exist beyond `dueSoon`. */
  moreCount: number;
}

/**
 * Builds the To-Dos card's progress bar + "Due Soon" list from today's tasks
 * and checklist runs combined. Open items sort soonest-due first; items with
 * no due time (checklist runs on a day-part with no end time, etc.) sort
 * last rather than being dropped.
 */
export function summarizeToDos(items: DueSoonSource[], limit = 4): ToDoSummary {
  const totalCount = items.length;
  const completedCount = items.filter((item) => item.completed).length;
  const percentComplete = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  const open = items
    .filter((item) => !item.completed)
    .sort((a, b) => {
      if (a.dueAt && b.dueAt) return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return 0;
    });

  return {
    totalCount,
    completedCount,
    percentComplete,
    dueSoon: open.slice(0, limit),
    moreCount: Math.max(0, open.length - limit),
  };
}

export interface BreakSummaryInput {
  status: string;
  /** ISO timestamp of computeBreakDueAt(), or null if it can't be computed yet. */
  dueAt: string | null;
}

export interface BreakSummary {
  /** Not yet completed or missed. */
  remaining: number;
  completed: number;
  /** Remaining breaks due within the next 60 minutes. */
  nextHour: number;
}

const CLOSED_BREAK_STATUSES = new Set(["completed", "missed"]);
const ONE_HOUR_MS = 60 * 60 * 1000;

/** Breaks StatTiles (Remaining / Completed / Next Hour) for the day-part's posted setup. */
export function summarizeBreaks(breaks: BreakSummaryInput[], now: Date): BreakSummary {
  let remaining = 0;
  let completed = 0;
  let nextHour = 0;

  for (const b of breaks) {
    const closed = CLOSED_BREAK_STATUSES.has(b.status);
    if (!closed) remaining += 1;
    if (b.status === "completed") completed += 1;

    if (!closed && b.dueAt) {
      const due = new Date(b.dueAt).getTime();
      if (!Number.isNaN(due) && due >= now.getTime() && due <= now.getTime() + ONE_HOUR_MS) {
        nextHour += 1;
      }
    }
  }

  return { remaining, completed, nextHour };
}
