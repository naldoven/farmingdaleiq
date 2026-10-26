import { nextOpenDay } from "@/app/(app)/catering/drivers/logic";
import type { DriverView } from "@/app/(app)/catering/drivers/validation";
import { addStoreCalendarDays } from "@/lib/time";

/**
 * Words for the Drivers page tabs and empty states. Pure so the Saturday case
 * (Sunday is closed, so "Tomorrow" is Monday) is unit tested.
 */

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });

function weekdayName(date: string): string {
  return WEEKDAY.format(new Date(`${date}T12:00:00.000Z`));
}

/**
 * "Tomorrow" when the next open day really is tomorrow; otherwise the weekday
 * name. A tab that says "Tomorrow" on Saturday but lists Monday's orders would
 * send a leader to the wrong day.
 */
export function tomorrowTabLabel(today: string): string {
  const next = nextOpenDay(today);
  return next === addStoreCalendarDays(today, 1) ? "Tomorrow" : weekdayName(next);
}

/** The empty-state line for an order tab. */
export function emptyOrdersMessage(view: Exclude<DriverView, "roster">, today: string): string {
  if (view === "today") return "No delivery orders today.";
  if (view === "week") return "No delivery orders this week.";
  const label = tomorrowTabLabel(today);
  return label === "Tomorrow" ? "No delivery orders tomorrow." : `No delivery orders on ${label}.`;
}
