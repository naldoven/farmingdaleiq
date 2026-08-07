export const STORE_TIME_ZONE = "America/New_York";

type DateInput = string | Date | null | undefined;

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDateInput(value: DateInput): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  // A Postgres `date` has no timezone. Parsing it at UTC midnight shifts it
  // into the previous evening in New York, so anchor date-only values at noon.
  const parsed = DATE_ONLY_RE.test(value) ? new Date(`${value}T12:00:00.000Z`) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateFormatter(options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { timeZone: STORE_TIME_ZONE, ...options });
}

const DATE_TIME_FORMATTER = dateFormatter({ dateStyle: "medium", timeStyle: "short" });
const DATE_FORMATTER = dateFormatter({ dateStyle: "medium" });
const TIME_FORMATTER = dateFormatter({ hour: "numeric", minute: "2-digit" });
const HOUR_FORMATTER = dateFormatter({ hour: "numeric", hourCycle: "h23" });
const INPUT_FORMATTER = dateFormatter({
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Renders an instant in the Farmingdale store timezone on both server and client. */
export function formatStoreDateTime(value: DateInput, fallback = "—"): string {
  const date = parseDateInput(value);
  return date ? DATE_TIME_FORMATTER.format(date) : fallback;
}

/** Renders a timestamp or a timezone-free Postgres date in the store timezone. */
export function formatStoreDate(value: DateInput, fallback = "—"): string {
  const date = parseDateInput(value);
  return date ? DATE_FORMATTER.format(date) : fallback;
}

/** Renders only the time from an instant in the Farmingdale store timezone. */
export function formatStoreTime(value: DateInput, fallback = "—"): string {
  const date = parseDateInput(value);
  return date ? TIME_FORMATTER.format(date) : fallback;
}

/** Returns the local 24-hour clock hour for an instant in the store timezone. */
export function storeHour(value: DateInput): number | null {
  const date = parseDateInput(value);
  if (!date) return null;
  const hour = HOUR_FORMATTER.formatToParts(date).find((part) => part.type === "hour")?.value;
  const parsedHour = Number(hour);
  return Number.isInteger(parsedHour) ? parsedHour : null;
}

/** Formats an instant for a datetime-local control in the store timezone. */
export function formatStoreDateTimeInput(value: DateInput): string {
  const date = parseDateInput(value);
  if (!date) return "";
  const parts = new Map(INPUT_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}T${parts.get("hour")}:${parts.get("minute")}`;
}

function storeZoneOffsetMs(date: Date): number {
  const parts = new Map(
    new Intl.DateTimeFormat("en-US", {
      timeZone: STORE_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  const wallClock = Date.UTC(
    Number(parts.get("year")),
    Number(parts.get("month")) - 1,
    Number(parts.get("day")),
    Number(parts.get("hour")),
    Number(parts.get("minute")),
    Number(parts.get("second")),
  );
  return wallClock - date.getTime();
}

/** Interprets a datetime-local value as a Farmingdale store wall-clock time. */
export function storeDateTimeInputToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00"] = match;
  const wallClock = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  let instant = wallClock - storeZoneOffsetMs(new Date(wallClock));
  instant = wallClock - storeZoneOffsetMs(new Date(instant));
  return new Date(instant).toISOString();
}

/** Returns YYYY-MM-DD for an instant in the store timezone, including DST. */
export function storeLocalDate(value: Date = new Date(), timeZone = STORE_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

/** Adds calendar days to a YYYY-MM-DD value without depending on server UTC. */
export function addStoreCalendarDays(date: string, days: number): string {
  const parsed = parseDateInput(date);
  if (!parsed) return date;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}
