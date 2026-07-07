import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamMemberManager } from "@/components/people/team-member-manager";
import { TeamSettingsForm } from "@/components/people/team-settings-form";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/** /people/teams/[id] — rename/delete a team, manage its membership. */
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
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/people/teams" className="text-sm text-muted-foreground hover:underline">
        &larr; Teams
      </Link>

      <h1 className="text-2xl font-semibold">{team.name}</h1>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Team settings</CardTitle>
          </CardHeader>
          <CardContent>
            <TeamSettingsForm teamId={team.id} initialName={team.name} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <TeamMemberManager
              teamId={team.id}
              members={members}
              addableProfiles={addableProfiles}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {members.length === 0 && (
                <li className="text-sm text-muted-foreground">No members yet.</li>
              )}
              {members.map((member) => (
                <li key={member.id} className="text-sm">
                  {member.name}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
