import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateCourseForm } from "@/components/training/create-course-form";
import { PassportCard } from "@/components/training/passport-card";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /training — Passports: my progress, all passports, trainer sign-offs,
 * leader stamping; admin: passport items, courses.
 * ARCHITECTURE.md "Training — Development Passports".
 */
export default async function TrainingPage() {
  await requirePermission("training.view");
  const canManage = await hasPermission("training.manage");
  const canStamp = await hasPermission("training.stamp");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const currentUserId = userData.user?.id ?? null;

  const [
    { data: profiles },
    { data: passports },
    { data: items },
    { data: enrollments },
    { data: progress },
    { data: ratings },
    { data: courses },
  ] = await Promise.all([
    supabase.from("profiles").select("id, name").eq("active", true).order("name"),
    supabase
      .from("passports")
      .select("id, kind, name, position_id, target_role_id, org_tier_id, active")
      .eq("active", true)
      .order("name"),
    supabase.from("passport_items").select("id, passport_id, type, label, sort, course_id"),
    supabase.from("passport_enrollments").select("id, passport_id, user_id, track, stamped_at"),
    supabase.from("passport_item_progress").select("enrollment_id, item_id, completed_at"),
    supabase.from("position_ratings").select("user_id, position_id, stars").eq("is_current", true),
    supabase.from("training_courses").select("id, name, description, sort").order("sort"),
  ]);

  const people = profiles ?? [];
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const starsByUserPosition = new Map(
    (ratings ?? []).map((r) => [`${r.user_id}:${r.position_id}`, r.stars]),
  );

  const positionPassports = (passports ?? []).filter((p) => p.kind === "position");
  const leadershipPassports = (passports ?? []).filter((p) => p.kind === "leadership");

  const myEnrollments = (enrollments ?? []).filter((e) => e.user_id === currentUserId);

  function buildCardProps(passport: NonNullable<typeof passports>[number]) {
    const passportItems = (items ?? []).filter((i) => i.passport_id === passport.id);
    const passportEnrollments = (enrollments ?? [])
      .filter((e) => e.passport_id === passport.id)
      .map((e) => ({
        id: e.id,
        userId: e.user_id,
        userName: nameById.get(e.user_id) ?? "Unknown",
        track: e.track,
        stampedAt: e.stamped_at,
      }));
    const progressByEnrollment: Record<string, { itemId: string; completedAt: string | null }[]> = {};
    for (const e of passportEnrollments) {
      progressByEnrollment[e.id] = (progress ?? [])
        .filter((p) => p.enrollment_id === e.id)
        .map((p) => ({ itemId: p.item_id, completedAt: p.completed_at }));
    }
    const currentStarsByUser: Record<string, number | null> = {};
    for (const e of passportEnrollments) {
      currentStarsByUser[e.userId] =
        passport.position_id !== null ? starsByUserPosition.get(`${e.userId}:${passport.position_id}`) ?? null : null;
    }

    return {
      passportId: passport.id,
      passportName: passport.name,
      kind: passport.kind as "position" | "leadership",
      items: passportItems.map((i) => ({
        id: i.id,
        type: i.type as "check" | "slider" | "photo" | "signature" | "course",
        label: i.label,
        sort: i.sort,
        course_id: i.course_id,
      })),
      enrollments: passportEnrollments,
      progress: progressByEnrollment,
      people,
      canManage,
      canStamp,
      currentUserId,
      currentStarsByUser,
    };
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Passports</h1>

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My progress</TabsTrigger>
          <TabsTrigger value="position">Position passports</TabsTrigger>
          <TabsTrigger value="leadership">Leadership passports</TabsTrigger>
          <TabsTrigger value="courses">Courses</TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="flex flex-col gap-3">
          {myEnrollments.length === 0 && (
            <p className="text-sm text-muted-foreground">You aren&apos;t enrolled on any passports yet.</p>
          )}
          {myEnrollments.map((e) => {
            const passport = (passports ?? []).find((p) => p.id === e.passport_id);
            const passportItems = (items ?? []).filter((i) => i.passport_id === e.passport_id);
            const myProgress = (progress ?? []).filter((p) => p.enrollment_id === e.id);
            const completedIds = new Set(myProgress.filter((p) => p.completed_at !== null).map((p) => p.item_id));
            return (
              <Card key={e.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {passport?.name ?? "Passport"}
                    {e.stamped_at ? <Badge variant="success">Stamped</Badge> : <Badge variant="outline">In progress</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {completedIds.size} / {passportItems.length} items complete
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="position" className="flex flex-col gap-4">
          {positionPassports.map((passport) => (
            <PassportCard key={passport.id} {...buildCardProps(passport)} />
          ))}
          {positionPassports.length === 0 && (
            <p className="text-sm text-muted-foreground">No position passports yet (created automatically per position).</p>
          )}
        </TabsContent>

        <TabsContent value="leadership" className="flex flex-col gap-4">
          {leadershipPassports.map((passport) => (
            <PassportCard key={passport.id} {...buildCardProps(passport)} />
          ))}
          {leadershipPassports.length === 0 && (
            <p className="text-sm text-muted-foreground">No leadership passports yet.</p>
          )}
        </TabsContent>

        <TabsContent value="courses" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Courses ({(courses ?? []).length})</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {(courses ?? []).map((c) => (
                <div key={c.id} className="rounded-md border p-2">
                  <p className="font-medium">{c.name}</p>
                  {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
                </div>
              ))}
              {(courses ?? []).length === 0 && <p className="text-sm text-muted-foreground">No courses yet.</p>}
            </CardContent>
          </Card>
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Add a course</CardTitle>
              </CardHeader>
              <CardContent>
                <CreateCourseForm />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
