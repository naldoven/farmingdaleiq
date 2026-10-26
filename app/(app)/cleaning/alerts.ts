import type { ItemKind } from "@/app/(app)/cleaning/constants";
import { shortDateLabel, weekdayShort } from "@/app/(app)/cleaning/today-view";
import { addDays, isoWeekday, type AssignmentStatus, type SlotHalf } from "@/app/(app)/cleaning/week-logic";

/**
 * Words for the cleaning alerts (docs/CLEANING-PLAN.md "Decisions": Alerts and
 * Discord). Pure, so the hourly job only gathers rows and queues events.
 *
 * Discord posts name items and areas, never people: the leaderboard is
 * leaders-only, and #cleaning is not. That is also why the Discord events
 * and the coordinator's in-app notices are separate events: the Discord
 * sender @mentions whoever an event is addressed to, so an event that both
 * posts to Discord and notifies Mariana would ping her by name in the
 * channel.
 */

/** Longest list a post or notice spells out before "and N more". */
const LIST_MAX = 10;

/** Saturday store time the "plan next week" reminder goes out. */
const PLAN_REMINDER_FROM = "10:00:00";

export interface SummaryRow {
  status: AssignmentStatus;
  /** A done clean a planner sent back; its redo is a separate clean. */
  rejected: boolean;
  itemName: string;
  zoneName: string;
  half: SlotHalf;
}

export interface DailySummary {
  title: string;
  message: string;
  /** "Mon Oct 26". */
  dateLabel: string;
  /** The missed cleans, item (area, half), capped. Empty when none. */
  missedText: string;
  counts: {
    planned: number;
    done: number;
    missed: number;
    skipped: number;
    redo: number;
    carriedOver: number;
  };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function cappedList(entries: string[]): string {
  const shown = entries.slice(0, LIST_MAX);
  const rest = entries.length - shown.length;
  return rest > 0 ? `${shown.join("; ")}; and ${rest} more` : shown.join("; ");
}

/** "Oct 26". */
function monthDay(date: string): string {
  return shortDateLabel(date).slice(4);
}

/**
 * The day the morning summary reports on: yesterday, unless yesterday was
 * the closed Sunday (Monday's run has nothing new to say; Sunday's run
 * already covered Saturday).
 */
export function summaryDayFor(today: string): string | null {
  const yesterday = addDays(today, -1);
  return isoWeekday(yesterday) === 7 ? null : yesterday;
}

/**
 * One day's cleans in a sentence or two for #cleaning (plan: "daily done /
 * missed / carried-over counts, the list of missed items"). Skipped cleans
 * were deferred on purpose, so they leave the total; a clean a planner sent
 * back is counted as a redo, not as done. Null when the day had no cleans.
 */
export function buildDailySummary(input: { date: string; rows: SummaryRow[]; carriedOver: number }): DailySummary | null {
  if (input.rows.length === 0) return null;

  const skipped = input.rows.filter((r) => r.status === "skipped").length;
  const owed = input.rows.filter((r) => r.status !== "skipped");
  const finished = (r: SummaryRow) => r.status === "done" || r.status === "not_needed";
  const done = owed.filter((r) => finished(r) && !r.rejected).length;
  const redo = owed.filter((r) => finished(r) && r.rejected).length;
  const missedRows = owed
    .filter((r) => r.status === "missed")
    .sort(
      (a, b) =>
        (a.half === b.half ? 0 : a.half === "am" ? -1 : 1) ||
        a.itemName.localeCompare(b.itemName, undefined, { numeric: true }),
    );
  const missedText = cappedList(missedRows.map((r) => `${r.itemName} (${r.zoneName}, ${r.half.toUpperCase()})`));

  const parts = [`${done} of ${owed.length} done.`];
  if (redo > 0) parts.push(`${redo} sent back for a redo.`);
  if (skipped > 0) parts.push(`${skipped} skipped.`);
  if (missedRows.length > 0) {
    parts.push(`${missedRows.length} missed, ${input.carriedOver} carried over.`);
    parts.push(`Missed: ${missedText}.`);
  } else {
    parts.push("Nothing missed.");
  }

  const dateLabel = shortDateLabel(input.date);
  return {
    title: `Cleaning, ${dateLabel}`,
    message: parts.join(" "),
    dateLabel,
    missedText,
    counts: {
      planned: owed.length,
      done,
      missed: missedRows.length,
      skipped,
      redo,
      carriedOver: input.carriedOver,
    },
  };
}

/**
 * The coordinator's in-app misses summary (plan "Alerts": "end-of-day misses
 * summary to coordinators"). Only when something was missed: a "nothing
 * missed" notice every morning would train people to ignore the bell.
 */
export function buildMissesNotice(summary: DailySummary): { title: string; body: string; link: string } | null {
  const { missed, carriedOver } = summary.counts;
  if (missed === 0) return null;
  return {
    title: `${plural(missed, "clean", "cleans")} missed on ${summary.dateLabel}`,
    body: `${summary.missedText}. ${carriedOver} carried over to the next open day.`,
    link: "/cleaning/week",
  };
}

export interface WeekRow {
  date: string;
  half: SlotHalf;
  itemName: string;
  zoneName: string;
  kind: ItemKind;
}

/**
 * Monday's "week published" post (plan "Discord": "a Monday 'week published'
 * post with the week's variable cleans"). The fixed cleans are the same
 * every week, so only the rotating ones are spelled out.
 */
export function buildWeekPublished(input: { weekStart: string; rows: WeekRow[] }): { title: string; message: string } {
  const rotating = input.rows
    .filter((r) => r.kind === "variable")
    .sort((a, b) => (a.date === b.date ? (a.half === b.half ? 0 : a.half === "am" ? -1 : 1) : a.date < b.date ? -1 : 1))
    .map((r) => `${weekdayShort(r.date)} ${r.half.toUpperCase()} ${r.itemName} (${r.zoneName})`);
  const planned = `${plural(input.rows.length, "clean", "cleans")} planned.`;
  return {
    title: `Cleaning week of ${monthDay(input.weekStart)} is live`,
    message: rotating.length > 0 ? `${planned} Rotating this week: ${cappedList(rotating)}.` : `${planned} No rotating cleans this week.`,
  };
}

export function isPlanReminderTime(today: string, timeOfDay: string): boolean {
  return isoWeekday(today) === 6 && timeOfDay >= PLAN_REMINDER_FROM;
}

/**
 * Saturday's nudge to the coordinator (plan "Alerts": Saturday "plan next
 * week" reminder): next week goes live Monday whether or not she has looked.
 */
export function buildPlanReminder(input: {
  nextWeekStart: string;
  built: boolean;
  planned: number;
  dueNotPlaced: number;
}): { title: string; body: string; link: string } {
  const link = `/cleaning/week?week=${input.nextWeekStart}`;
  if (!input.built) {
    return {
      title: "Plan next week's cleaning",
      body: "Next week's board isn't built yet. Open the week board and tap Build now.",
      link,
    };
  }
  const tray = input.dueNotPlaced > 0 ? `, ${input.dueNotPlaced} due but not placed` : "";
  return {
    title: "Plan next week's cleaning",
    body: `Week of ${monthDay(input.nextWeekStart)}: ${plural(input.planned, "clean", "cleans")} planned${tray}. It goes live Monday.`,
    link,
  };
}
