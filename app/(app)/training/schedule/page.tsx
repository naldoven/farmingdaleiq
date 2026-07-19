import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateSessionForm } from "@/components/training/create-session-form";
import { DeleteSessionButton } from "@/components/training/delete-session-button";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { totalWeeklyHours, weekDates } from "@/app/(app)/training/schedule/logic";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * /training/schedule — trainee week schedule: station + time + trainer per
 * day, session tags, print view. ARCHITECTURE.md "Trainee lifecycle" >
 * "Trainee schedule". Print styling uses Tailwind's `print:` variant on this
 * page's own content (hiding action buttons/forms); the outer app shell
 * (sidebar/nav) is shared/frozen and out of scope for this stream.
 */
export default async function TraineeSchedulePage() {
  await requirePermission("training.view");
  const canManage = await hasPermission("training.manage");

  const supabase = await createClient();
  const dates = weekDates(new Date());

  const [{ data: enrollments }, { data: positions }, { data: trainers }, { data: sessions }] = await Promise.all([
    supabase
      .from("trainee_enrollments")
      .select("id, user_id, status, profiles(name)")
      .eq("status", "active"),
    supabase.from("positions").select("id, name").order("sort"),
    supabase.from("profiles").select("id, name").eq("active", true).order("name"),
    supabase
      .from("training_sessions")
      .select("id, enrollment_id, date, start_time, end_time, position_id, trainer_user_id, tags, note, positions(name)")
      .gte("date", dates[0])
      .lte("date", dates[6]),
  ]);

  const trainerNameById = new Map((trainers ?? []).map((t) => [t.id, t.name]));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-semibold">Trainee Schedule</h1>
        <p className="text-sm text-muted-foreground">
          Week of {dates[0]} – {dates[6]}
        </p>
      </div>

      {(enrollments ?? []).map((enrollment) => {
        const enrollmentSessions = (sessions ?? []).filter((s) => s.enrollment_id === enrollment.id);
        const weeklyHours = totalWeeklyHours(enrollmentSessions);
        const name = (enrollment.profiles as unknown as { name: string } | null)?.name ?? "Unknown";

        return (
          <Card key={enrollment.id} className="print:break-inside-avoid">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{name}</span>
                <Badge variant="outline">{weeklyHours}h this week</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
                {dates.map((date, i) => {
                  const daySessions = enrollmentSessions.filter((s) => s.date === date);
                  return (
                    <div key={date} className="rounded-md border p-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        {DAY_LABELS[i]} {date.slice(5)}
                      </p>
                      <ul className="mt-1 flex flex-col gap-1">
                        {daySessions.map((s) => (
                          <li key={s.id} className="flex items-start justify-between gap-1 text-xs">
                            <span>
                              {s.start_time?.slice(0, 5) ?? ""}
                              {s.end_time ? `–${s.end_time.slice(0, 5)}` : ""}{" "}
                              {(s.positions as unknown as { name: string } | null)?.name ?? ""}
                              {s.trainer_user_id && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  w/ {trainerNameById.get(s.trainer_user_id) ?? "?"}
                                </span>
                              )}
                              {(s.tags ?? []).map((tag) => (
                                <Badge key={tag} variant="outline" className="ml-1">
                                  {tag}
                                </Badge>
                              ))}
                            </span>
                            {canManage && (
                              <span className="print:hidden">
                                <DeleteSessionButton id={s.id} />
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
              {canManage && (
                <div className="print:hidden">
                  <CreateSessionForm enrollmentId={enrollment.id} positions={positions ?? []} trainers={trainers ?? []} />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      {(enrollments ?? []).length === 0 && <p className="text-sm text-muted-foreground">No active trainees.</p>}
    </div>
  );
}
