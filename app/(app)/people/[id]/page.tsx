import Link from "next/link";
import { notFound } from "next/navigation";

import { AvatarInitials, HScroll, MetricCard, SectionCard, StatTile, StatusBadge } from "@/components/mobile";
import { ProfileEditForm } from "@/components/people/profile-edit-form";
import { SelfProfileEditForm } from "@/components/people/self-profile-edit-form";
import { RoleAssignForm } from "@/components/people/role-assign-form";
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

  const trainingSubline =
    trainingProgress.active === 0 && trainingProgress.graduated === 0 && trainingProgress.pip === 0
      ? "—"
      : [
          `${trainingProgress.active} active`,
          trainingProgress.graduated > 0 ? `${trainingProgress.graduated} graduated` : null,
          trainingProgress.pip > 0 ? `${trainingProgress.pip} on PIP` : null,
        ]
          .filter(Boolean)
          .join(", ");

  const passportSubline =
    passportProgress.completed + passportProgress.inProgress === 0
      ? "—"
      : `${passportProgress.completed} completed, ${passportProgress.inProgress} in progress`;

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <Link href="/people" className="text-[13px] font-semibold text-accent">
        &larr; Roster
      </Link>

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-card p-6 text-center shadow-card">
        <AvatarInitials name={profile.name} size="lg" />
        <div>
          <p className="text-[22px] font-bold text-ink">{profile.name}</p>
          <p className="text-[13px] text-muted-ink">{profile.email}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <StatusBadge tone={profile.active ? "success" : "neutral"} dot>
            {profile.active ? "Active" : "Inactive"}
          </StatusBadge>
          {badges.map((badge) => (
            <StatusBadge key={badge.kind} tone="accent">
              {badge.label}
            </StatusBadge>
          ))}
        </div>
      </div>

      <SectionCard title="Personal record">
        <div className="flex flex-col gap-4">
          <HScroll>
            <StatTile value={openTaskCount} label="Open to-dos" />
            <StatTile value={completedTaskCount} label="Completed to-dos" tone="success" />
            <StatTile
              value={tokenBalance !== null ? tokenBalance : "—"}
              label="Token balance"
              tone="warning"
            />
            <StatTile
              value={accountabilityPoints !== null ? accountabilityPoints : "—"}
              label="Accountability"
              tone={accountabilityPoints ? "danger" : "neutral"}
            />
          </HScroll>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MetricCard title="Trainee lifecycle" value={trainingSubline} />
            <MetricCard title="Development passports" value={passportSubline} />
          </div>
          {accountabilityPoints === null && !isSelf && (
            <p className="text-[13px] text-muted-ink">
              Accountability points are hidden — requires accountability.manage.
            </p>
          )}
          {tokenBalance === null && !isSelf && (
            <p className="text-[13px] text-muted-ink">
              Token balance is hidden — requires tokens.manage.
            </p>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Role">
        <RoleAssignForm
          profileId={profile.id}
          initialRoleId={profile.role_id}
          roles={(roles ?? []).map((r) => ({ id: r.id, name: r.name }))}
          canEdit={canManage}
        />
      </SectionCard>

      <SectionCard title="Profile">
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
      </SectionCard>
    </div>
  );
}
