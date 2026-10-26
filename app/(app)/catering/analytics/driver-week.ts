import { driverWeekRange } from "@/app/(app)/catering/drivers/logic";
import { addStoreCalendarDays } from "@/lib/time";

export interface DriverWeekView {
  range: { start: string; end: string };
  /** Any date inside the previous week, for the "Previous week" link. */
  prevDate: string;
  /** Any date inside the next week; null once the shown week is the current one. */
  nextDate: string | null;
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * The week the scorecard shows. `?driverWeek=` takes any date in the week; a
 * missing, malformed, or future value falls back to the current week, so a
 * hand-edited link never lands on an empty week that can't be navigated out of.
 */
export function resolveDriverWeek(param: string | undefined, today: string): DriverWeekView {
  const current = driverWeekRange(today);
  const asked = param && isRealDate(param) ? driverWeekRange(param) : current;
  const range = asked.start > current.start ? current : asked;
  return {
    range,
    prevDate: addStoreCalendarDays(range.start, -7),
    nextDate: range.start < current.start ? addStoreCalendarDays(range.start, 7) : null,
  };
}

/**
 * Link to another scorecard week that keeps every other query param. Next
 * hands repeated params over as arrays, so those are written back as repeats.
 */
export function driverWeekHref(searchParams: Record<string, string | string[] | undefined>, date: string): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "driverWeek" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) next.append(key, item);
  }
  next.set("driverWeek", date);
  return `/catering/analytics?${next.toString()}`;
}

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Week of Oct 12 to Oct 17" */
export function driverWeekTitle(range: { start: string; end: string }): string {
  const format = (date: string) => SHORT_DATE.format(new Date(`${date}T12:00:00.000Z`));
  return `Week of ${format(range.start)} to ${format(range.end)}`;
}
