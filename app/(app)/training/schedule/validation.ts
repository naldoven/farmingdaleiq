import { z } from "zod";

// Re-exported so server/action code can keep importing it from here; the client
// form imports it directly from ./constants to stay zod-free.
export { SESSION_TAG_OPTIONS } from "./constants";

/** "HH:MM" -> minutes since midnight, or null if unparseable. */
function timeToMinutes(time: string): number | null {
  const match = time.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export const createSessionSchema = z
  .object({
    enrollmentId: z.string().uuid(),
    date: z.string().min(1, "Date is required"),
    positionId: z.string().uuid().nullable().optional(),
    startTime: z.string().trim().optional().or(z.literal("")),
    endTime: z.string().trim().optional().or(z.literal("")),
    trainerUserId: z.string().uuid().nullable().optional(),
    tags: z.array(z.string()).default([]),
    note: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  // TR8: a session with end <= start is 0 (or negative) hours. Reject it up
  // front instead of silently storing a bogus 0-hour session that sessionHours
  // then quietly drops from the weekly total. Only enforced when BOTH times are
  // present and parseable; a session with no times is still allowed.
  .refine(
    (v) => {
      if (!v.startTime || !v.endTime) return true;
      const start = timeToMinutes(v.startTime);
      const end = timeToMinutes(v.endTime);
      if (start === null || end === null) return true;
      return end > start;
    },
    { message: "End time must be after the start time.", path: ["endTime"] },
  );
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const deleteSessionSchema = z.object({ id: z.string().uuid() });
export type DeleteSessionInput = z.infer<typeof deleteSessionSchema>;
