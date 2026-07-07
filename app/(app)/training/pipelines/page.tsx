import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PassportCard } from "@/components/training/passport-card";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { buildPassportCardProps } from "@/app/(app)/training/passport-data";

/**
 * /training/pipelines — Masters and leadership stage pipelines with
 * per-person progress. ARCHITECTURE.md "Trainee lifecycle" > "Masters and
 * leadership pipelines". Pipelines are leadership passports whose items are
 * the program's stages; an enrollment's `track` field holds the pipeline
 * variant (e.g. DT/FC/OT/Both). Reuses the same PassportCard as /training's
 * leadership tab -- see app/(app)/training/passport-data.ts.
 */
export default async function PipelinesPage() {
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
  ] = await Promise.all([
    supabase.from("profiles").select("id, name").eq("active", true).order("name"),
    supabase
      .from("passports")
      .select("id, kind, name, position_id, target_role_id, org_tier_id, active")
      .eq("kind", "leadership")
      .eq("active", true)
      .order("name"),
    supabase.from("passport_items").select("id, passport_id, type, label, sort, course_id"),
    supabase.from("passport_enrollments").select("id, passport_id, user_id, track, stamped_at"),
    supabase.from("passport_item_progress").select("enrollment_id, item_id, completed_at"),
    supabase.from("position_ratings").select("user_id, position_id, stars").eq("is_current", true),
  ]);

  const people = profiles ?? [];
  const nameById = new Map(people.map((p) => [p.id, p.name]));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Pipelines</h1>
      <p className="text-sm text-muted-foreground">
        Masters and leadership stage pipelines. Completing the final stage stamps the passport, which can
        auto-upgrade the person&apos;s role and fill an org chart slot.
      </p>

      {(passports ?? []).map((passport) => (
        <PassportCard
          key={passport.id}
          {...buildPassportCardProps(passport, {
            items: items ?? [],
            enrollments: enrollments ?? [],
            progress: progress ?? [],
            ratings: ratings ?? [],
            nameById,
            people,
            canManage,
            canStamp,
            currentUserId,
          })}
        />
      ))}

      {(passports ?? []).length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No pipelines yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Leadership passports created here become pipelines automatically.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
