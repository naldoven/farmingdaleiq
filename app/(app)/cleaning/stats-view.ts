import { monthBounds, monthLabel, monthOf, recentMonths, type LeaderTally, type OverdueItem, type StatRow, type Tally, type TrendPoint, type ZoneTally, statOwner } from "@/app/(app)/cleaning/stats";
import { shortDateLabel } from "@/app/(app)/cleaning/today-view";
import { addDays, type AssignmentStatus, type SlotHalf } from "@/app/(app)/cleaning/week-logic";

/**
 * Pure shaping for /cleaning/stats (docs/CLEANING-PLAN.md "Decisions":
 * Metrics). stats.ts does the counting; this file turns its results into what
 * the screen draws (labels, bar heights, tones) and reads the one URL
 * parameter, so all of it is tested without Supabase or React.
 */

export type StatsTone = "success" | "warning" | "danger" | "neutral";

// Month and date range ------------------------------------------------------------

const MONTH_PARAM = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Nothing older than this can have cleans (the module started in 2026), and
 * it keeps Date.UTC's two-digit-year quirk (year 0 to 99 means 1900 to 1999)
 * away from monthBounds.
 */
const EARLIEST_MONTH = "2020-01";

/**
 * ?month=YYYY-MM to a month the page can show. A missing, malformed, future
 * or ancient value falls back to the current month rather than an error page,
 * the same forgiving rule the week board uses for ?week.
 */
export function parseMonthParam(raw: string | undefined, today: string): string {
  const current = monthOf(today);
  if (!raw || !MONTH_PARAM.test(raw)) return current;
  // Fixed-width YYYY-MM strings compare correctly as text.
  if (raw > current || raw < EARLIEST_MONTH) return current;
  return raw;
}

/**
 * The dates a month is scored over. The current month stops at yesterday:
 * today's cleans are still open, so scoring them would show a miss for work
 * the shift has not had time to do. Null when nothing has closed yet (the
 * first of the month, or a month after today).
 */
export function scoredRange(month: string, today: string): { from: string; to: string } | null {
  const current = monthOf(today);
  if (month > current) return null;
  const { from, to } = monthBounds(month);
  const end = month === current ? addDays(today, -1) : to;
  return end < from ? null : { from, to: end };
}

/** One line under the month chips saying how far the current month is scored. */
export function rangeNote(month: string, today: string): string | null {
  if (month !== monthOf(today)) return null;
  const range = scoredRange(month, today);
  if (!range) return null;
  return `Scored through ${shortDateLabel(range.to)}. Today's cleans count once the day has closed.`;
}

export function emptyMonthText(month: string, today: string): string {
  if (month === monthOf(today)) {
    return "No closed days with cleans yet this month. Cleans count once their day has closed.";
  }
  return `No cleans were recorded in ${monthLabel(month)}.`;
}

export interface MonthChip {
  month: string;
  /** "Oct 2026". */
  label: string;
  href: string;
  active: boolean;
}

export function monthChipLabel(month: string): string {
  return monthLabel(month).replace(/^(\w{3})\w*/, "$1");
}

/**
 * The months the picker offers, newest first. A month reached by a typed URL
 * that is older than the offered six is added at the end, so the page never
 * shows a month with no chip lit.
 */
export function monthChips(today: string, selected: string): MonthChip[] {
  const months = recentMonths(today);
  if (!months.includes(selected)) months.push(selected);
  return months.map((month) => ({
    month,
    label: monthChipLabel(month),
    href: `/cleaning/stats?month=${month}`,
    active: month === selected,
  }));
}

// Rows ----------------------------------------------------------------------------

interface AssignmentRowLike {
  id: string;
  item_id: string;
  date: string;
  half: string;
  status: string;
  origin: string;
  carried_from_id: string | null;
  owner_user_id: string | null;
  completed_at: string | null;
  rejected_at: string | null;
}

/** The check constraints on the table guarantee half and status, so a cast is safe. */
export function toStatRows(rows: AssignmentRowLike[]): StatRow[] {
  return rows.map((r) => ({
    id: r.id,
    item_id: r.item_id,
    date: r.date,
    half: r.half as SlotHalf,
    status: r.status as AssignmentStatus,
    origin: r.origin,
    carried_from_id: r.carried_from_id,
    owner_user_id: r.owner_user_id,
    completed_at: r.completed_at,
    rejected_at: r.rejected_at,
  }));
}

/**
 * The people leaderStats will credit, so the page asks for exactly their
 * names. The same owner rule as leaderStats (statOwner).
 */
export function leaderIds(rows: StatRow[], setupOwners: Map<string, string | null>): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    const owner = statOwner(row, setupOwners);
    if (owner) ids.add(owner);
  }
  return [...ids];
}

// Percent and tone -----------------------------------------------------------------

export function pctText(pct: number | null): string {
  return pct === null ? "-" : `${pct}%`;
}

/**
 * Green at the plan's success bar (90% of planned cleans done on their day),
 * amber down to 70%, red below. A null percent has nothing to judge. The
 * number is always printed beside the color, never color alone.
 */
export function pctTone(pct: number | null): StatsTone {
  if (pct === null) return "neutral";
  if (pct >= 90) return "success";
  if (pct >= 70) return "warning";
  return "danger";
}

// Store trend ---------------------------------------------------------------------

export interface TrendBar {
  weekStart: string;
  /** "Oct 26". */
  label: string;
  pctText: string;
  /** 0 to 100, the bar's height as a share of the track. */
  heightPct: number;
  tone: StatsTone;
  /** Screen-reader sentence for the whole column. */
  summary: string;
}

/** A 0% week still draws a sliver, so an empty track reads as "no data", not "zero". */
const MIN_BAR = 4;

export function barHeight(pct: number | null): number {
  if (pct === null) return 0;
  return Math.min(100, Math.max(MIN_BAR, pct));
}

export function trendBars(points: TrendPoint[]): TrendBar[] {
  return points.map((p) => ({
    weekStart: p.weekStart,
    label: p.label,
    pctText: pctText(p.pct),
    heightPct: barHeight(p.pct),
    tone: pctTone(p.pct),
    summary:
      p.pct === null
        ? `Week of ${p.label}: nothing closed yet`
        : `Week of ${p.label}: ${p.pct}% on time, ${p.missed} missed`,
  }));
}

// Leaders, areas, overdue ---------------------------------------------------------

export interface LeaderRowView {
  userId: string;
  name: string;
  pctText: string;
  tone: StatsTone;
  owned: number;
  missed: number;
  carriedOver: number;
}

export function leaderRows(leaders: LeaderTally[]): LeaderRowView[] {
  return leaders.map((l) => ({
    userId: l.userId,
    name: l.name,
    pctText: pctText(l.pct),
    tone: pctTone(l.pct),
    owned: l.owed,
    missed: l.missed,
    carriedOver: l.carriedOver,
  }));
}

export interface UnownedView {
  owed: number;
  missed: number;
  pctText: string;
  tone: StatsTone;
}

/** Null when every cleaned day had a posted Setup, so the card stays quiet. */
export function unownedView(unowned: Tally): UnownedView | null {
  if (unowned.owed === 0) return null;
  return { owed: unowned.owed, missed: unowned.missed, pctText: pctText(unowned.pct), tone: pctTone(unowned.pct) };
}

export interface AreaRowView {
  zoneId: string;
  name: string;
  color: string;
  pctText: string;
  tone: StatsTone;
  owed: number;
  missed: number;
}

export function areaRows(zones: ZoneTally[]): AreaRowView[] {
  return zones.map((z) => ({
    zoneId: z.zoneId,
    name: z.name,
    color: z.color,
    pctText: pctText(z.pct),
    tone: pctTone(z.pct),
    owed: z.owed,
    missed: z.missed,
  }));
}

export interface OverdueRowView {
  id: string;
  name: string;
  zoneName: string;
  href: string;
  /** "12 days overdue", or "Never cleaned" when it has no due date at all. */
  badge: string;
  /** Null when the badge already says it was never cleaned. */
  lastText: string | null;
}

export function overdueRows(items: OverdueItem[]): OverdueRowView[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    zoneName: item.zoneName,
    href: `/cleaning/items/${item.id}`,
    badge:
      item.daysOverdue === null
        ? "Never cleaned"
        : `${item.daysOverdue} ${item.daysOverdue === 1 ? "day" : "days"} overdue`,
    lastText: item.lastDone
      ? `Last cleaned ${shortDateLabel(item.lastDone)}`
      : item.daysOverdue === null
        ? null
        : "Never cleaned",
  }));
}
