import Link from "next/link";
import { Users } from "lucide-react";

import { ListRow, SectionCard } from "@/components/mobile";
import { TeamCreateForm } from "@/components/people/team-create-form";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /people/teams — team roster CRUD (ARCHITECTURE.md "/people" page-map row:
 * "...teams"). Reads rely on RLS (teams_select_authenticated: any signed-in
 * store member); writes are gated by teams.manage in
 * app/(app)/people/teams/actions.ts.
 *
 * Visual/layout redesign onto the KitchenIQ mobile system
 * (docs/DESIGN-SYSTEM.md): a "Create a team" card (unchanged form) plus a
 * flush SectionCard of ListRows, one per team, linking to its detail page.
 */
export default async function TeamsPage() {
  const canManage = await hasPermission("teams.manage");
  const supabase = await createClient();

  const [{ data: teams }, { data: memberships }] = await Promise.all([
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("team_members").select("team_id"),
  ]);

  const memberCountByTeam = new Map<string, number>();
  for (const m of memberships ?? []) {
    memberCountByTeam.set(m.team_id, (memberCountByTeam.get(m.team_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <Link href="/people" className="text-[13px] font-semibold text-accent">
        &larr; Roster
      </Link>

      {canManage && (
        <SectionCard title="Create a team">
          <TeamCreateForm />
        </SectionCard>
      )}

      <SectionCard flush>
        {(teams ?? []).length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted-ink">No teams yet.</p>
        ) : (
          <div className="divide-y divide-line">
            {(teams ?? []).map((team) => (
              <ListRow
                key={team.id}
                icon={Users}
                title={team.name}
                description={`${memberCountByTeam.get(team.id) ?? 0} members`}
                href={`/people/teams/${team.id}`}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
