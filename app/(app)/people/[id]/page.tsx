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
 * PPL2: sensitive PII (phone, email, birthdate, hired_on, discord_user_id) is
 * visible only to the person themselves or a people.manage holder. Any other
 * signed-in coworker sees only non-sensitive info.
 */
export function canSeeProfilePII(isSelf: boolean, canManage: boolean): boolean {
  return isSelf || canManage;
}

export type ProfileSectionVariant = "self-edit" | "manager-edit" | "restricted";

/**
 * Which Profile-section variant to render (PPL2):
 *  - "self-edit"    : the person, without people.manage → narrow self-service form.
 *  - "manager-edit" : a people.manage holder → full editable form (sees PII).
 *  - "restricted"   : anyone else → NO PII form, only a privacy note. This is
 *    the branch that closes the leak: a non-self, non-manager viewer never gets
 *    the phone/email/birthdate/hired_on/discord_user_id fields rendered.
 */
export function profileSectionVariant(isSelf: boolean, canManage: boolean): ProfileSectionVariant {
  if (isSelf && !canManage) return "self-edit";
  if (canManage) return "manager-edit";
  return "restricted";
}

/**
 * PPL1: the roles a viewer may assign — only those at or below their OWN rank
 * (a lower `rank` number is more senior, so a viewer can never assign a role
 * senior to their own). A null actor rank or null role rank is excluded so an
 * unranked actor can't assign a ranked role and an unranked role is never
 * offered. The DB privilege-guard trigger is the real enforcement; this keeps
 * the dropdown from offering a choice the trigger would reject.
 */
export function assignableRolesForRank<T extends { rank: number | null }>(
  roles: T[],
  actorRank: number | null,
): T[] {
  return roles.filter((r) => r.rank != null && actorRank != null && r.rank >= actorRank);
}

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
  // PPL2: sensitive PII (phone, email, birthdate, hired_on, discord_user_id)
  // is visible only to the person themselves or to a people.manage holder.
  // Any other signed-in coworker sees only non-sensitive info (name, role,
  // avatar, active status).
  const canSeePII = canSeeProfilePII(isSelf, canManage);
  const profileVariant = profileSectionVariant(isSelf, canManage);
  const [canViewAccountability, canViewTokens, { data: viewerProfile }] = await Promise.all([
    hasPermission("accountability.manage"),
    hasPermission("tokens.manage"),
    supabase.from("profiles").select("role_id").eq("id", authUser?.id ?? "").maybeSingle(),
  ]);

  // PPL1: the viewer may only assign roles at or below their OWN rank (a lower
  // `rank` number is more senior). The DB privilege-guard trigger is the real
  // enforcement; this filters the dropdown so the UI never offers a role the
  // trigger would reject.
  const actorRank =
    viewerProfile?.role_id != null ? roleRankById.get(viewerProfile.role_id) ?? null : null;
  const assignableRoles = assignableRolesForRank(roles ?? [], actorRank);

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
          {canSeePII && <p className="text-[13px] text-muted-ink">{profile.email}</p>}
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
          assignableRoles={assignableRoles.map((r) => ({ id: r.id, name: r.name }))}
          canEdit={canManage && !isSelf}
        />
      </SectionCard>

      <SectionCard title="Profile">
        {profileVariant === "self-edit" ? (
          <SelfProfileEditForm
            initialPhone={profile.phone}
            initialBirthdate={profile.birthdate}
            initialAvatarUrl={profile.avatar_url}
          />
        ) : profileVariant === "manager-edit" ? (
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
        ) : (
          // PPL2: a non-self, non-manager viewer never receives the sensitive
          // fields. Name, role, avatar, and active status are already shown
          // above; the contact PII is deliberately withheld here.
          <p className="text-[13px] text-muted-ink">
            Contact details (phone, email, birthday, hire date, Discord ID) are
            visible only to the person and to managers.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
