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

/**
 * The arrival and scheduled-end values to save when a slot's person changes.
 *
 * Both times belong to the PERSON, not the slot. Reassigning used to carry the
 * previous person's arrival and scheduled end onto the new one, which feeds
 * their break due time and entitlement. A different person (or unassigning)
 * starts clean: "" is what assignPosition() stores as null. Picking the same
 * person again keeps what is saved. The leader sets the new person's times.
 */
export function timesForReassign(
  previousUserId: string | null,
  nextUserId: string | null,
  current: { arrival_time: string | null; scheduled_end: string | null },
): { arrivalTime: string; scheduledEnd: string } {
  if (previousUserId === nextUserId) {
    return { arrivalTime: current.arrival_time ?? "", scheduledEnd: current.scheduled_end ?? "" };
  }
  return { arrivalTime: "", scheduledEnd: "" };
}

/**
 * The scheduled-end value to save from the field's current text, or null when
 * nothing needs saving. An empty field CLEARS the scheduled end (sent as "",
 * stored as null, so the engine falls back to the day-part end); previously an
 * empty value returned early, so a wrong scheduled end could never be removed.
 * Returns null when the text matches what is already saved, so tabbing through
 * an untouched field does not fire a save.
 */
export function scheduledEndToSave(
  fieldValue: string,
  savedIso: string | null | undefined,
): string | null {
  if (fieldValue === isoToLocalInput(savedIso)) return null;
  return fieldValue ? localInputToIso(fieldValue) : "";
}

