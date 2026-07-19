/**
 * SETB1: datetime-local <-> ISO helpers for the setup board arrival-time field.
 *
 * An <input type="datetime-local"> value is a *local* wall-clock string
 * "YYYY-MM-DDTHH:mm" with no time zone. Saving does
 * `new Date(local).toISOString()` (local wall clock -> UTC), which is correct.
 * Displaying MUST do the exact inverse (UTC -> local wall clock); the old board
 * showed the raw UTC timestamp (`arrival_time.slice(0, 16)`) as if it were
 * local, so the field drifted by the browser's UTC offset (4-5h on Long Island)
 * every save + reload. These two helpers are exact inverses, so what a leader
 * types is what they see on reload, across DST (Date does the real arithmetic).
 */

/** UTC ISO timestamp -> local "YYYY-MM-DDTHH:mm" for a datetime-local input. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** Local "YYYY-MM-DDTHH:mm" (from a datetime-local input) -> UTC ISO string. */
export function localInputToIso(local: string): string {
  return new Date(local).toISOString();
}
