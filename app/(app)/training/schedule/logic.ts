/** Pure helpers for the Trainee week schedule (ARCHITECTURE.md "Trainee
 * lifecycle" > "Trainee schedule"): "Weekly hour totals show per trainee." */

function timeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Hours for one session; 0 if either time is missing/unparseable. */
export function sessionHours(startTime: string | null, endTime: string | null): number {
  if (!startTime || !endTime) return 0;
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || end <= start) return 0;
  return (end - start) / 60;
}

export function totalWeeklyHours(sessions: { start_time: string | null; end_time: string | null }[]): number {
  const total = sessions.reduce((sum, s) => sum + sessionHours(s.start_time, s.end_time), 0);
  return Math.round(total * 100) / 100;
}

/** Monday-start ISO dates for the week containing `date`. */
export function weekDates(date: Date): string[] {
  const day = date.getDay(); // 0 = Sunday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
