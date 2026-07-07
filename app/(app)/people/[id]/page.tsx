import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileEditForm } from "@/components/people/profile-edit-form";
import { RoleAssignForm } from "@/components/people/role-assign-form";
import { PersonBadges } from "@/components/people/person-badges";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { computeBadges } from "@/lib/setups/badges";
import { loadTraineeUserIds } from "@/lib/integration/people-badges";
import { createClient } from "@/lib/supabase/server";

/**
 * /people/[id] profile page — ARCHITECTURE.md "/people" page-map row.
 * Contact fields, role, birthdate, hired_on, discord_user_id, active toggle;
 * edits go through the people.manage-guarded server actions in
 * app/(app)/people/actions.ts.
 */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("people.view");
  const canManage = await hasPermission("people.manage");
  const { id } = await params;

  const supabase = await createClient();

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, name, email, phone, discord_user_id, birthdate, hired_on, active, role_id, created_at",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("roles").select("id, name, rank").order("rank"),
  ]);

  if (!profile) {
    notFound();
  }

  const roleRankById = new Map((roles ?? []).map((r) => [r.id, r.rank]));
  const traineeUserIds = await loadTraineeUserIds(supabase, [profile.id]);
  const badges = computeBadges(
    {
      hiredOn: profile.hired_on,
      birthdate: profile.birthdate,
      roleRank: profile.role_id ? roleRankById.get(profile.role_id) ?? null : null,
      isTrainee: traineeUserIds.has(profile.id),
    },
    new Date(),
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/people" className="text-sm text-muted-foreground hover:underline">
          &larr; Roster
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{profile.name}</h1>
        <p className="text-sm text-muted-foreground">{profile.email}</p>
        <PersonBadges badges={badges} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Role</CardTitle>
        </CardHeader>
        <CardContent>
          <RoleAssignForm
            profileId={profile.id}
            initialRoleId={profile.role_id}
            roles={(roles ?? []).map((r) => ({ id: r.id, name: r.name }))}
            canEdit={canManage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileEditForm
            profileId={profile.id}
            initialName={profile.name}
            initialPhone={profile.phone}
            initialDiscordUserId={profile.discord_user_id}
            initialBirthdate={profile.birthdate}
            initialHiredOn={profile.hired_on}
            initialActive={profile.active}
            canEdit={canManage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
