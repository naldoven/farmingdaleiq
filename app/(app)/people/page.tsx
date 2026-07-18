import Link from "next/link";

import { SectionCard } from "@/components/mobile";
import { RosterFilters, type RosterStatusFilter } from "@/components/people/roster-filters";
import { RosterRow } from "@/components/people/roster-row";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { computeBadges } from "@/lib/setups/badges";
import { loadTraineeUserIds } from "@/lib/integration/people-badges";
import { createClient } from "@/lib/supabase/server";

/**
 * /people roster -- ARCHITECTURE.md page map: "Roster, profiles, roles &
 * permissions, teams." Reads are gated by people.view, which every seeded
 * role holds (supabase/migrations/20260707001900_seed_store_config.sql), so
 * this mirrors the RLS reality (profiles_select_store_member: any active
 * store member can see the roster) rather than actually restricting anyone
 * today. Writes (edit/role/teams/invite) require people.manage/teams.manage
 * and are enforced in the server actions, not here.
 *
 * Visual/layout redesign onto the KitchenIQ mobile system
 * (docs/DESIGN-SYSTEM.md): a LIST screen -- SearchBar + FilterChip row, an
 * "All (N)" count, then a flush SectionCard of RosterRows (AvatarInitials +
 * name + role + highlight badges + a StatusBadge). All data fetching,
 * filtering, and permission checks are unchanged from the previous table
 * layout.
 */
export const metadata = { title: "People" };

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; active?: string }>;
}) {
  await requirePermission("people.view");
  const canManage = await hasPermission("people.manage");
  const canManageRoles = await hasPermission("roles.manage");
  const { q, active } = await searchParams;
  const statusFilter: RosterStatusFilter =
    active === "active" || active === "inactive" ? active : "";

  const supabase = await createClient();

  const [{ data: profiles }, { data: roles }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name, email, role_id, active, birthdate, hired_on")
      .order("name"),
    supabase.from("roles").select("id, name, rank").order("rank"),
  ]);

  const roleNameById = new Map((roles ?? []).map((r) => [r.id, r.name]));
  const roleRankById = new Map((roles ?? []).map((r) => [r.id, r.rank]));

  // P2 wiring: real cross-module badges on the roster. Break status is a
  // live-shift signal (a person is only "Needs Break" relative to a posted
  // setup), so the roster shows the profile-derived badges (New, Minor,
  // Trainee, Leader, Birthday); the setup board adds Needs Break in context.
  const traineeUserIds = await loadTraineeUserIds(
    supabase,
    (profiles ?? []).map((p) => p.id),
  );
  const now = new Date();

  const filtered = (profiles ?? []).filter((p) => {
    if (statusFilter === "active" && !p.active) return false;
    if (statusFilter === "inactive" && p.active) return false;
    if (q) {
      const needle = q.toLowerCase();
      if (
        !p.name.toLowerCase().includes(needle) &&
        !p.email.toLowerCase().includes(needle)
      ) {
        return false;
      }
    }
    return true;
  });

  const countLabel =
    statusFilter === "active"
      ? "Active"
      : statusFilter === "inactive"
        ? "Inactive"
        : "All";

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/people/teams"
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-[13px] font-semibold text-ink hover:bg-secondary"
        >
          Teams
        </Link>
        {canManageRoles && (
          <Link
            href="/people/roles"
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-[13px] font-semibold text-ink hover:bg-secondary"
          >
            Roles &amp; permissions
          </Link>
        )}
        {canManage && (
          <Link
            href="/people/invite"
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-accent/90"
          >
            Invite person
          </Link>
        )}
        {!canManage && (
          <Link
            href="/people/bootstrap"
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-[13px] font-semibold text-muted-ink hover:bg-secondary"
          >
            Claim admin access
          </Link>
        )}
      </div>

      <RosterFilters initialQuery={q ?? ""} initialStatus={statusFilter} />

      <p className="px-1 text-[13px] font-semibold text-muted-ink">
        {countLabel} ({filtered.length})
      </p>

      <SectionCard flush>
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted-ink">
            No one matches this search.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {filtered.map((profile) => (
              <RosterRow
                key={profile.id}
                href={`/people/${profile.id}`}
                name={profile.name}
                roleName={profile.role_id ? (roleNameById.get(profile.role_id) ?? null) : null}
                active={profile.active}
                badges={computeBadges(
                  {
                    hiredOn: profile.hired_on,
                    birthdate: profile.birthdate,
                    roleRank: profile.role_id ? (roleRankById.get(profile.role_id) ?? null) : null,
                    isTrainee: traineeUserIds.has(profile.id),
                  },
                  now,
                )}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
