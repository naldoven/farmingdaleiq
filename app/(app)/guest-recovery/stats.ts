import {
  FAULT_LABELS,
  FAULT_SOURCES,
  type FaultSource,
  FAST_SEND_MINUTES,
  NO_REASON_LABEL,
  REASON_LABELS,
  STALE_OWED_DAYS,
  type Reason,
} from "@/app/(app)/guest-recovery/constants";
import { STORE_TIME_ZONE, storeLocalDate } from "@/lib/time";

/**
 * Pure reporting math for /guest-recovery/reporting. No database access: the
 * page loads rows and passes them in. Every month, weekday and day part is the
 * store-local (America/New_York) time, never the server's.
 */

export interface ReportRow {
  id: string;
  status: "owed" | "given" | "void";
  createdAt: string;
  givenAt: string | null;
  loggedBy: string;
  loggedByName: string;
  items: {
    family: string;
    qty: number;
    /** The item carried changes (no pickles, extra sauce, a note). */
    modded?: boolean;
    /** Where a wrong item or mod most likely went wrong; null when the fault check was not asked. */
    faultSource?: string | null;
  }[];
  /** Null for recoveries logged before reasons existed. */
  reason: string | null;
  /** Earliest sent_at of any successful send. */
  firstSendAt: string | null;
  emailSent: boolean;
  smsSent: boolean;
}

export interface DayPartInput {
  name: string;
  start_time: string;
  end_time: string;
  sort: number;
}

export interface GuestRecoveryReport {
  month: string;
  recoveries: number;
  stillOwed: number;
  pickedUpPct: number | null;
  voided: number;
  lastMonthRecoveries: number;
  typicalSendMinutes: number | null;
  typicalPickupDays: number | null;
  byMonth: { month: string; count: number }[];
  missingItems: { family: string; recoveries: number }[];
  totalRecoveries: number;
  /** Void recoveries count here, like missingItems. Key "none" = not recorded. */
  reasons: { reason: string; label: string; recoveries: number }[];
  repeatGuests: { recoveries: number; guests: number } | null;
  /**
   * Item lines that carried changes, and the recoveries they sat on. Item lines,
   * not quantities: two sandwiches on one line with the same change count once.
   * Voided recoveries are left out here and in the two fault lists, because a
   * void means it was logged by mistake.
   */
  mods: { lines: number; recoveries: number };
  /** Item lines by where the fault was, biggest first. Only lines where the fault check was asked. */
  faultSources: { source: FaultSource; label: string; lines: number }[];
  /** The same lines grouped by item family, so the item that keeps going wrong shows first. */
  faultByFamily: ({ family: string; total: number } & Record<FaultSource, number>)[];
  byDaypart: { name: string; count: number }[];
  byWeekday: { day: string; count: number }[];
  loggedBy: { name: string; count: number }[];
  followThrough: {
    emailed: number;
    texted: number;
    sentWithin15Min: number;
    sendable: number;
    stillOwed: number;
    owedOverSevenDays: number;
    notSent: number;
  };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const OTHER_HOURS = "Other hours";
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const CLOCK_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: STORE_TIME_ZONE,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Store-local month (YYYY-MM) of an instant. */
function monthOf(iso: string): string {
  return storeLocalDate(new Date(iso)).slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  return `${year}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Store-local weekday index (0 = Mon) and minutes since midnight. */
function clockOf(iso: string): { weekday: number; minutes: number } {
  const parts = new Map(CLOCK_FORMATTER.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  const weekday = WEEKDAYS.indexOf(parts.get("weekday") as (typeof WEEKDAYS)[number]);
  return {
    weekday,
    minutes: Number(parts.get("hour")) * 60 + Number(parts.get("minute")),
  };
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** A day part may run past midnight (for example 22:00 to 02:00). */
function inDayPart(minutes: number, part: DayPartInput): boolean {
  const start = timeToMinutes(part.start_time);
  const end = timeToMinutes(part.end_time);
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function buildGuestRecoveryReport(
  rows: ReportRow[],
  opts: {
    month: string;
    now: Date;
    dayParts: DayPartInput[];
    repeat?: { recoveries: number; guests: number } | null;
  },
): GuestRecoveryReport {
  const { month, now } = opts;
  const monthOfRow = new Map(rows.map((r) => [r.id, monthOf(r.createdAt)]));
  const inMonth = rows.filter((r) => monthOfRow.get(r.id) === month);
  const live = inMonth.filter((r) => r.status !== "void");

  const owed = live.filter((r) => r.status === "owed").length;
  const given = live.filter((r) => r.status === "given").length;
  const pickedUpPct = given + owed === 0 ? null : Math.round((given / (given + owed)) * 100);

  const sendMinutes = live
    .filter((r) => r.firstSendAt)
    .map((r) => (new Date(r.firstSendAt as string).getTime() - new Date(r.createdAt).getTime()) / MINUTE_MS)
    .map((m) => Math.max(0, m));
  const pickupDays = live
    .filter((r) => r.status === "given" && r.givenAt)
    .map((r) => (new Date(r.givenAt as string).getTime() - new Date(r.createdAt).getTime()) / DAY_MS)
    .map((d) => Math.max(0, d));
  const sendMedian = median(sendMinutes);
  const pickupMedian = median(pickupDays);

  const monthCounts = new Map<string, number>();
  for (const r of rows) {
    const m = monthOfRow.get(r.id) as string;
    monthCounts.set(m, (monthCounts.get(m) ?? 0) + 1);
  }
  const byMonth = Array.from({ length: 6 }, (_, i) => {
    const m = shiftMonth(month, i - 5);
    return { month: m, count: monthCounts.get(m) ?? 0 };
  });

  // Each family counts once per recovery, however many sizes or units it had.
  const familyCounts = new Map<string, number>();
  for (const r of inMonth) {
    for (const family of new Set(r.items.map((i) => i.family))) {
      familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
    }
  }
  const missingItems = [...familyCounts]
    .map(([family, recoveries]) => ({ family, recoveries }))
    .sort((a, b) => b.recoveries - a.recoveries || a.family.localeCompare(b.family));

  const reasonCounts = new Map<string, number>();
  for (const r of inMonth) {
    const key = r.reason ?? "none";
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
  }
  const reasons = [...reasonCounts]
    .map(([reason, recoveries]) => ({
      reason,
      label: reason === "none" ? NO_REASON_LABEL : (REASON_LABELS[reason as Reason] ?? reason),
      recoveries,
    }))
    .sort((a, b) => b.recoveries - a.recoveries || a.label.localeCompare(b.label));

  let moddedLines = 0;
  let moddedRecoveries = 0;
  const sourceCounts = new Map<FaultSource, number>();
  const familyFaults = new Map<string, { family: string; total: number } & Record<FaultSource, number>>();
  for (const r of live) {
    let hadMods = false;
    for (const item of r.items) {
      if (item.modded) {
        moddedLines += 1;
        hadMods = true;
      }
      const source = item.faultSource;
      if (!source || !(FAULT_SOURCES as readonly string[]).includes(source)) continue;
      const known = source as FaultSource;
      sourceCounts.set(known, (sourceCounts.get(known) ?? 0) + 1);
      const entry =
        familyFaults.get(item.family) ??
        { family: item.family, total: 0, made_wrong: 0, order_entry: 0, bagging: 0, not_sure: 0 };
      entry.total += 1;
      entry[known] += 1;
      familyFaults.set(item.family, entry);
    }
    if (hadMods) moddedRecoveries += 1;
  }
  const faultSources = [...sourceCounts]
    .map(([source, lines]) => ({ source, label: FAULT_LABELS[source], lines }))
    .sort((a, b) => b.lines - a.lines || a.label.localeCompare(b.label));
  const faultByFamily = [...familyFaults.values()].sort(
    (a, b) => b.total - a.total || a.family.localeCompare(b.family),
  );

  const partsSorted = [...opts.dayParts].sort((a, b) => a.sort - b.sort);
  const partCounts = partsSorted.map(() => 0);
  let other = 0;
  const weekdayCounts = WEEKDAYS.map(() => 0);
  for (const r of inMonth) {
    const { weekday, minutes } = clockOf(r.createdAt);
    if (weekday >= 0) weekdayCounts[weekday] += 1;
    const idx = partsSorted.findIndex((p) => inDayPart(minutes, p));
    if (idx >= 0) partCounts[idx] += 1;
    else other += 1;
  }
  const byDaypart = partsSorted.map((p, i) => ({ name: p.name, count: partCounts[i] }));
  if (other > 0) byDaypart.push({ name: OTHER_HOURS, count: other });

  const loggerCounts = new Map<string, { name: string; count: number }>();
  for (const r of inMonth) {
    const entry = loggerCounts.get(r.loggedBy) ?? { name: r.loggedByName, count: 0 };
    entry.count += 1;
    loggerCounts.set(r.loggedBy, entry);
  }

  const staleCutoff = now.getTime() - STALE_OWED_DAYS * DAY_MS;
  const fastCutoff = FAST_SEND_MINUTES * MINUTE_MS;

  return {
    month,
    recoveries: inMonth.length,
    stillOwed: owed,
    pickedUpPct,
    voided: inMonth.length - live.length,
    lastMonthRecoveries: monthCounts.get(shiftMonth(month, -1)) ?? 0,
    typicalSendMinutes: sendMedian === null ? null : Math.round(sendMedian),
    typicalPickupDays: pickupMedian === null ? null : Math.round(pickupMedian * 10) / 10,
    byMonth,
    missingItems,
    totalRecoveries: inMonth.length,
    reasons,
    repeatGuests: opts.repeat ?? null,
    mods: { lines: moddedLines, recoveries: moddedRecoveries },
    faultSources,
    faultByFamily,
    byDaypart,
    byWeekday: WEEKDAYS.map((day, i) => ({ day, count: weekdayCounts[i] })),
    loggedBy: [...loggerCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    followThrough: {
      emailed: live.filter((r) => r.emailSent).length,
      texted: live.filter((r) => r.smsSent).length,
      sentWithin15Min: live.filter(
        (r) =>
          r.firstSendAt !== null &&
          new Date(r.firstSendAt).getTime() - new Date(r.createdAt).getTime() <= fastCutoff,
      ).length,
      sendable: live.length,
      stillOwed: owed,
      // All months on purpose: an old owed recovery matters most.
      owedOverSevenDays: rows.filter(
        (r) => r.status === "owed" && new Date(r.createdAt).getTime() < staleCutoff,
      ).length,
      notSent: live.filter((r) => r.firstSendAt === null && !r.emailSent && !r.smsSent).length,
    },
  };
}
