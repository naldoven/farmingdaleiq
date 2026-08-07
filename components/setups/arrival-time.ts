/**
 * SETB1: datetime-local <-> ISO helpers for the setup board arrival-time field.
 *
 * An <input type="datetime-local"> value is a *local* wall-clock string
 * "YYYY-MM-DDTHH:mm" with no timezone. These helpers always interpret that
 * clock in America/New_York, so arrival times do not depend on the manager's
 * device timezone and stay stable across daylight saving changes.
 */
import { formatStoreDateTimeInput, storeDateTimeInputToIso } from "@/lib/time";

/** UTC ISO timestamp -> New York "YYYY-MM-DDTHH:mm" for a datetime-local input. */
export function isoToLocalInput(iso: string | null | undefined): string {
  return formatStoreDateTimeInput(iso);
}

/** New York "YYYY-MM-DDTHH:mm" (from a datetime-local input) -> UTC ISO string. */
export function localInputToIso(local: string): string {
  return storeDateTimeInputToIso(local) ?? new Date(local).toISOString();
}
