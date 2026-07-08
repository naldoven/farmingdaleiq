import Link from "next/link";
import { notFound } from "next/navigation";

import { SectionCard } from "@/components/mobile";
import { PersonRow } from "@/components/people/person-row";
import { TeamMemberManager } from "@/components/people/team-member-manager";
import { TeamSettingsForm } from "@/components/people/team-settings-form";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /people/teams/[id] — rename/delete a team, manage its membership.
 * Visual/layout redesign onto the KitchenIQ mobile system
 * (docs/DESIGN-SYSTEM.md): SectionCards replace the shadcn Card wrappers;
 * the read-only member list renders as PersonRows (AvatarInitials + name).
 */
export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const canManage = await hasPermission("teams.manage");
  const { id } = await params;

  const supabase = await createClient();

  const [{ data: team }, { data: memberRows }, { data: allProfiles }] = await Promise.all([
    supabase.from("teams").select("id, name").eq("id", id).maybeSingle(),
    supabase.from("team_members").select("user_id").eq("team_id", id),
    supabase.from("profiles").select("id, name").order("name"),
  ]);

  if (!team) {
    notFound();
  }

  const memberIds = new Set((memberRows ?? []).map((m) => m.user_id));
  const profileNameById = new Map((allProfiles ?? []).map((p) => [p.id, p.name]));

  const members = [...memberIds].map((memberId) => ({
    id: memberId,
    name: profileNameById.get(memberId) ?? "Unknown",
  }));
  const addableProfiles = (allProfiles ?? [])
    .filter((p) => !memberIds.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <Link href="/people/teams" className="text-[13px] font-semibold text-accent">
        &larr; Teams
      </Link>

      <h1 className="text-[22px] font-bold text-ink">{team.name}</h1>

      {canManage && (
        <SectionCard title="Team settings">
          <TeamSettingsForm teamId={team.id} initialName={team.name} />
        </SectionCard>
      )}

      <SectionCard title="Members" flush={!canManage}>
        {canManage ? (
          <TeamMemberManager
            teamId={team.id}
            members={members}
            addableProfiles={addableProfiles}
          />
        ) : members.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted-ink">No members yet.</p>
        ) : (
          <div className="divide-y divide-line">
            {members.map((member) => (
              <PersonRow key={member.id} name={member.name} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
