import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileEditForm } from "@/components/people/profile-edit-form";
import { SelfProfileEditForm } from "@/components/people/self-profile-edit-form";
import { RoleAssignForm } from "@/components/people/role-assign-form";
import { PersonBadges } from "@/components/people/person-badges";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { computeBadges } from "@/lib/setups/badges";
import { loadTraineeUserIds } from "@/lib/integration/people-badges";
import { createClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/tokens/ledger";
import {
  countCompletedTasks,
  countOpenTasks,
  summarizeActiveAccountabilityPoints,
  summarizePassportProgress,
  summarizeTrainingProgress,
} from "@/app/(app)/people/personal-record";

/**
 * /people/[id] profile page — ARCHITECTURE.md "/people" page-map row.
 * Contact fields, role, birthdate, hired_on, discord_user_id, avatar_url,
 * active toggle, plus a read-only cross-module "Personal record" summary
 * (to-dos, token balance, accountability points, trainee/passport progress).
 * Admin edits (people.manage) go through updateProfile/assignRole; a viewer
 * looking at their own profile without people.manage gets the narrower
 * self-service `updateOwnProfile` path instead (phone/birthdate/avatar_url
 * only). All server actions live in app/(app)/people/actions.ts.
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
        "id, name, email, phone, discord_user_id, birthdate, hired_on, avatar_url, active, role_id, created_at",
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

  // Personal record: read-only cross-module summary (KITCHENIQ-PARITY-AUDIT.md
  // "People & Teams" [MED]). Every source table here is readable by any
  // signed-in store member except infractions (accountability.manage or the
  // profile's own self-scoped `my_infractions` view) and token_transactions
  // (tokens.manage or self) — those two are gated below to respect the same
  // rules their own modules enforce.
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const isSelf = authUser?.id === profile.id;
  const [canViewAccountability, canViewTokens] = await Promise.all([
    hasPermission("accountability.manage"),
    hasPermission("tokens.manage"),
  ]);

  const [
    { data: assignedTasks },
    { data: completedTasks },
    { data: traineeEnrollments },
    { data: passportEnrollments },
  ] = await Promise.all([
    supabase.from("tasks").select("status").eq("assigned_user_id", profile.id),
    supabase.from("tasks").select("status").eq("completed_by", profile.id),
    supabase.from("trainee_enrollments").select("status").eq("user_id", profile.id),
    supabase.from("passport_enrollments").select("stamped_at").eq("user_id", profile.id),
  ]);

  const openTaskCount = countOpenTasks(assignedTasks ?? []);
  const completedTaskCount = countCompletedTasks(completedTasks ?? []);
  const trainingProgress = summarizeTrainingProgress(traineeEnrollments ?? []);
  const passportProgress = summarizePassportProgress(passportEnrollments ?? []);

  let accountabilityPoints: number | null = null;
  if (isSelf) {
    const { data } = await supabase
      .from("my_infractions")
      .select("points, expires_at")
      .eq("user_id", profile.id);
    accountabilityPoints = summarizeActiveAccountabilityPoints(data ?? [], new Date());
  } else if (canViewAccountability) {
    const { data } = await supabase
      .from("infractions")
      .select("points, expires_at")
      .eq("user_id", profile.id);
    accountabilityPoints = summarizeActiveAccountabilityPoints(data ?? [], new Date());
  }

  let tokenBalance: number | null = null;
  if (isSelf || canViewTokens) {
    tokenBalance = await getBalance(profile.id, supabase);
  }

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
          <CardTitle>Personal record</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Open to-dos
              </dt>
              <dd className="mt-0.5 text-lg font-semibold">{openTaskCount}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Completed to-dos
              </dt>
              <dd className="mt-0.5 text-lg font-semibold">{completedTaskCount}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Token balance
              </dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {tokenBalance !== null ? tokenBalance : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Accountability points
              </dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {accountabilityPoints !== null ? accountabilityPoints : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Trainee lifecycle
              </dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {trainingProgress.active} active
                {trainingProgress.graduated > 0 && `, ${trainingProgress.graduated} graduated`}
                {trainingProgress.pip > 0 && `, ${trainingProgress.pip} on PIP`}
                {trainingProgress.active === 0 &&
                  trainingProgress.graduated === 0 &&
                  trainingProgress.pip === 0 &&
                  "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Development passports
              </dt>
              <dd className="mt-0.5 text-lg font-semibold">
                {passportProgress.completed + passportProgress.inProgress === 0
                  ? "—"
                  : `${passportProgress.completed} completed, ${passportProgress.inProgress} in progress`}
              </dd>
            </div>
          </dl>
          {accountabilityPoints === null && !isSelf && (
            <p className="mt-3 text-xs text-muted-foreground">
              Accountability points are hidden — requires accountability.manage.
            </p>
          )}
          {tokenBalance === null && !isSelf && (
            <p className="mt-1 text-xs text-muted-foreground">
              Token balance is hidden — requires tokens.manage.
            </p>
          )}
        </CardContent>
      </Card>

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
          {isSelf && !canManage ? (
            <SelfProfileEditForm
              initialPhone={profile.phone}
              initialBirthdate={profile.birthdate}
              initialAvatarUrl={profile.avatar_url}
            />
          ) : (
            <ProfileEditForm
              profileId={profile.id}
              initialName={profile.name}
              initialPhone={profile.phone}
              initialDiscordUserId={profile.discord_user_id}
              initialBirthdate={profile.birthdate}
              initialHiredOn={profile.hired_on}
              initialAvatarUrl={profile.avatar_url}
              initialActive={profile.active}
              canEdit={canManage}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
