import { storeLocalNow } from "@/app/(app)/checklists/logic";
import type { ItemKind } from "@/app/(app)/cleaning/constants";
import { shortDateLabel } from "@/app/(app)/cleaning/today-view";
import { nextDueDate, type AssignmentStatus, type SlotHalf } from "@/app/(app)/cleaning/week-logic";

/**
 * Cleaning metrics (docs/CLEANING-PLAN.md "Decisions": Metrics): shift-leader
 * on-time %, misses and carry-overs by month; zone completion % and most
 * overdue items; store weekly trend. Pure, so the stats page only loads rows.
 *
 * One counting rule everywhere, the same as the Today screen and the
 * morning summary: skipped cleans and cleans sent back for a redo are not
 * owed (the redo is its own clean), and a clean still open on its day is not
 * scored yet. On time means done on or before its day, store-local; a clean
 * finished after midnight but before the 3am close is late.
 */

export interface StatRow {
  id: string;
  item_id: string;
  date: string;
  half: SlotHalf;
  status: AssignmentStatus;
  origin: string;
  carried_from_id: string | null;
  owner_user_id: string | null;
  completed_at: string | null;
  rejected_at: string | null;
}

export type Outcome = "on_time" | "late" | "missed" | "open" | "not_owed";

export function outcome(row: StatRow, timeZone: string): Outcome {
  if (row.status === "skipped" || row.rejected_at !== null) return "not_owed";
  if (row.status === "missed") return "missed";
  if (row.status === "done" || row.status === "not_needed") {
    if (!row.completed_at) return "late";
    const doneOn = storeLocalNow(new Date(row.completed_at), timeZone).date;
    return doneOn <= row.date ? "on_time" : "late";
  }
  // Planned: still open today or later, or waiting for the 3am close.
  return "open";
}

export interface Tally {
  owed: number;
  onTime: number;
  late: number;
  missed: number;
  /** On time over cleans whose day has closed; null before any has. */
  pct: number | null;
}

export function tally(outcomes: Outcome[]): Tally {
  const owed = outcomes.filter((o) => o !== "not_owed").length;
  const onTime = outcomes.filter((o) => o === "on_time").length;
  const late = outcomes.filter((o) => o === "late").length;
  const missed = outcomes.filter((o) => o === "missed").length;
  const closed = onTime + late + missed;
  return { owed, onTime, late, missed, pct: closed === 0 ? null : Math.round((onTime / closed) * 100) };
}

/** "YYYY-MM" to its first and last day. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y! - 1}-12` : `${y}-${String(m! - 1).padStart(2, "0")}`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "October 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m! - 1]} ${y}`;
}

export interface LeaderTally extends Tally {
  userId: string;
  name: string;
  /** Misses this leader owned that carried over to another day. */
  carriedOver: number;
}

/**
 * Credits each clean to the leader on that day's Morning (AM) or Closing (PM)
 * Setup (plan "Who does it"). A miss keeps the owner the day-end close
 * stamped on it, so a Setup edited afterwards cannot move the blame. Cleans
 * on a day with no posted Setup go in their own bucket. Sorted by name, not
 * by score: the plan says no competition in v1.
 *
 * `setupOwners` is keyed "date|half".
 */
export function leaderStats(
  rows: StatRow[],
  setupOwners: Map<string, string>,
  names: Map<string, string>,
  timeZone: string,
): { leaders: LeaderTally[]; unowned: Tally } {
  const byLeader = new Map<string, Outcome[]>();
  const unowned: Outcome[] = [];
  const missedBy = new Map<string, string>();

  for (const row of rows) {
    const owner = row.owner_user_id ?? setupOwners.get(`${row.date}|${row.half}`) ?? null;
    const result = outcome(row, timeZone);
    if (owner) {
      byLeader.set(owner, [...(byLeader.get(owner) ?? []), result]);
      if (result === "missed") missedBy.set(row.id, owner);
    } else {
      unowned.push(result);
    }
  }

  const carried = new Map<string, number>();
  for (const row of rows) {
    if (row.origin !== "carry_over" || !row.carried_from_id) continue;
    const owner = missedBy.get(row.carried_from_id);
    if (owner) carried.set(owner, (carried.get(owner) ?? 0) + 1);
  }

  const leaders = [...byLeader.entries()]
    .map(([userId, outcomes]) => ({
      userId,
      name: names.get(userId) ?? "Former team member",
      carriedOver: carried.get(userId) ?? 0,
      ...tally(outcomes),
    }))
    .filter((l) => l.owed > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { leaders, unowned: tally(unowned) };
}

export interface ZoneTally extends Tally {
  zoneId: string;
  name: string;
  color: string;
}

/** Completion by area, in zone order; areas with nothing owed are left out. */
export function zoneStats(
  rows: StatRow[],
  itemZone: Map<string, string>,
  zones: { id: string; name: string; color: string; sort: number }[],
  timeZone: string,
): ZoneTally[] {
  const byZone = new Map<string, Outcome[]>();
  for (const row of rows) {
    const zoneId = itemZone.get(row.item_id);
    if (!zoneId) continue;
    byZone.set(zoneId, [...(byZone.get(zoneId) ?? []), outcome(row, timeZone)]);
  }
  return [...zones]
    .sort((a, b) => a.sort - b.sort)
    .map((z) => ({ zoneId: z.id, name: z.name, color: z.color, ...tally(byZone.get(z.id) ?? []) }))
    .filter((z) => z.owed > 0);
}

export interface TrendPoint {
  weekStart: string;
  /** "Oct 26". */
  label: string;
  owed: number;
  onTime: number;
  missed: number;
  pct: number | null;
}

/** cleaning_store_trend rows to labeled points. Every counted day has closed, so owed is the base. */
export function trendPoints(
  rows: { week_start: string; owed: number; on_time: number; missed: number }[],
): TrendPoint[] {
  return rows.map((r) => ({
    weekStart: r.week_start,
    label: shortDateLabel(r.week_start).slice(4),
    owed: r.owed,
    onTime: r.on_time,
    missed: r.missed,
    pct: r.owed === 0 ? null : Math.round((r.on_time / r.owed) * 100),
  }));
}

function daysBetween(from: string, to: string): number {
  const ms = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y!, m! - 1, day!);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

export interface OverdueItem {
  id: string;
  name: string;
  zoneName: string;
  /** Null when never cleaned and no start date: due since forever. */
  nextDue: string | null;
  daysOverdue: number | null;
  lastDone: string | null;
}

/**
 * The rotating cleans furthest past due, the master list's red dots in
 * order. Constants are left out: they come back every week on their own.
 */
export function mostOverdue(
  items: { id: string; name: string; zoneName: string; kind: ItemKind; interval_weeks: number | null; start_on: string | null }[],
  lastDone: Map<string, string>,
  today: string,
  limit = 10,
): OverdueItem[] {
  const overdue: OverdueItem[] = [];
  for (const item of items) {
    if (item.kind !== "variable" || item.interval_weeks === null) continue;
    const done = lastDone.get(item.id) ?? null;
    const nextDue = nextDueDate(item.interval_weeks, done, item.start_on);
    if (nextDue !== null && nextDue >= today) continue;
    overdue.push({
      id: item.id,
      name: item.name,
      zoneName: item.zoneName,
      nextDue,
      daysOverdue: nextDue === null ? null : daysBetween(nextDue, today),
      lastDone: done,
    });
  }
  return overdue
    .sort((a, b) => {
      if (a.daysOverdue === null) return b.daysOverdue === null ? 0 : -1;
      if (b.daysOverdue === null) return 1;
      return b.daysOverdue - a.daysOverdue;
    })
    .slice(0, limit);
}

/** The first day of the month a store-local date falls in, as "YYYY-MM". */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** The months the stats page offers: this one and the five before it. */
export function recentMonths(today: string, count = 6): string[] {
  const months = [monthOf(today)];
  while (months.length < count) months.push(previousMonth(months[months.length - 1]!));
  return months;
}
